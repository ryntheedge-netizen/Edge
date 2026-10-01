import { Router, Request, Response } from 'express';
import pool, { query, withTransaction } from '../db/database';
import { authenticateAttendanceAdmin, authenticateAttendanceScanner } from './auth';
import { PoolClient } from 'pg';

const router = Router();

// ==========================================
// SCANNER & MANUAL ENDPOINTS
// ==========================================

router.post('/scan', authenticateAttendanceScanner, async (req: Request, res: Response) => {
  const { participant_id, station_id, method = 'QR' } = req.body;
  const user = (req as any).user.username; // Note: In auth.ts the user object has `username`

  if (!participant_id || !station_id) {
    return res.status(400).json({ success: false, message: "Participant ID and Station ID are required." });
  }

  try {
    const result = await withTransaction(async (client: PoolClient) => {
      // 1. Get Station Info
      const stationRes = await client.query(`SELECT * FROM attendance_stations WHERE id = $1 AND is_active = true`, [station_id]);
      if (stationRes.rows.length === 0) throw new Error("Invalid or inactive station.");
      const station = stationRes.rows[0];
      if (station.status !== 'ACTIVE') throw new Error("STATION_STOPPED: Attendance scanning is currently stopped for this station.");

      // 2. Get Stage Info
      const stageRes = await client.query(`SELECT * FROM attendance_stages WHERE id = $1 AND is_active = true`, [station.stage_id]);
      if (stageRes.rows.length === 0) throw new Error("Associated attendance stage is invalid or inactive.");
      const stage = stageRes.rows[0];

      if (stage.status === 'FINALIZED') {
        throw new Error("This attendance stage has been finalized and is closed.");
      }

      // 3. Find Participant
      const participantRes = await client.query(`SELECT * FROM edge_participants WHERE participant_id = $1`, [participant_id]);
      if (participantRes.rows.length === 0) throw new Error("Participant not found.");
      const participant = participantRes.rows[0];
      if (!participant.is_active) throw new Error("Participant is not eligible for attendance.");

      // 4. Validate Event Assignment
      if (stage.stage_type === 'EVENT') {
        if (!station.activity_id) throw new Error("Station is misconfigured: EVENT stage requires an assigned activity.");
        
        const participationRes = await client.query(`
          SELECT 1 FROM edge_event_participations 
          WHERE participant_id = $1 AND activity_id = $2
        `, [participant.id, station.activity_id]);
        
        if (participationRes.rows.length === 0) {
          const assignedRes = await client.query(`
            SELECT a.name FROM edge_event_participations ep 
            JOIN edge_activities a ON ep.activity_id = a.id 
            WHERE ep.participant_id = $1
          `, [participant.id]);
          
          const currentActivityRes = await client.query(`SELECT name FROM edge_activities WHERE id = $1`, [station.activity_id]);
          const currentName = currentActivityRes.rows.length > 0 ? currentActivityRes.rows[0].name : 'this event';
          
          if (assignedRes.rows.length === 0) {
            throw new Error(`WRONG_EVENT: This participant is not assigned to any events. Rejected at ${currentName}.`);
          } else {
            const assignedNames = assignedRes.rows.map(a => a.name).join(' and ');
            throw new Error(`WRONG_EVENT: This participant is assigned to ${assignedNames}, not ${currentName}.`);
          }
        }
      }

      // 5. Check for Duplicate Attendance
      const duplicateCheckQuery = stage.stage_type === 'EVENT' 
        ? `SELECT id FROM attendance_records WHERE participant_id = $1 AND stage_id = $2 AND activity_id = $3`
        : `SELECT id FROM attendance_records WHERE participant_id = $1 AND stage_id = $2 AND activity_id IS NULL`;

      const params = stage.stage_type === 'EVENT' 
        ? [participant.id, stage.id, station.activity_id] 
        : [participant.id, stage.id];

      const existingRecordRes = await client.query(duplicateCheckQuery, params);
      
      if (existingRecordRes.rows.length > 0) {
        throw new Error("Already marked present.");
      }

      // 6. Insert Record
      await client.query(`
        INSERT INTO attendance_records (participant_id, stage_id, activity_id, station_id, attendance_method, marked_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        participant.id,
        stage.id,
        stage.stage_type === 'EVENT' ? station.activity_id : null,
        station.id,
        method === 'MANUAL' ? 'MANUAL' : 'QR',
        user
      ]);

      // Log Audit
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'ATTENDANCE_MARKED', JSON.stringify({ participant: participant.participant_id, stage: stage.name, station: station.id, method })
      ]);

      let teamName = '-';
      if (participant.team_id) {
        const teamRes = await client.query(`SELECT name FROM edge_teams WHERE id = $1`, [participant.team_id]);
        if (teamRes.rows.length > 0) teamName = teamRes.rows[0].name;
      }

      return {
        participantName: participant.name,
        participantId: participant.participant_id,
        teamName: teamName,
        stageName: stage.name,
        timestamp: new Date().toISOString()
      };
    });

    return res.json({ success: true, message: "Attendance Recorded", data: result });

  } catch (err: any) {
    if (err.message.includes('attendance_records_participant_id_stage_id_activity_id_key') || err.message.includes('Already marked present')) {
      return res.status(400).json({ success: false, message: "Already marked present." });
    }
    return res.status(400).json({ success: false, message: err.message || "Failed to record attendance." });
  }
});

router.delete('/scan/:id', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user.username;

  try {
    const recordRes = await query(`SELECT participant_id FROM attendance_records WHERE id = $1`, [id]);
    if (recordRes.rows.length === 0) return res.status(404).json({ success: false, message: "Record not found." });
    const record = recordRes.rows[0];

    await withTransaction(async (client: PoolClient) => {
      await client.query(`DELETE FROM attendance_records WHERE id = $1`, [id]);
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'ATTENDANCE_REVERT', JSON.stringify({ record_id: id, participant_id: record.participant_id })
      ]);
    });

    res.json({ success: true, message: "Attendance record reverted successfully." });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to revert record." });
  }
});

router.get('/stations', authenticateAttendanceScanner, async (req: Request, res: Response) => {
  try {
    const stationsRes = await query(`
      SELECT s.*, st.name as stage_name, st.stage_type, st.day, a.name as activity_name 
      FROM attendance_stations s
      JOIN attendance_stages st ON s.stage_id = st.id
      LEFT JOIN edge_activities a ON s.activity_id = a.id
      WHERE s.is_active = true
    `);
    res.json({ stations: stationsRes.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stations" });
  }
});

router.post('/station/:id/status', authenticateAttendanceScanner, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = (req as any).user.username;

  if (!['NOT_STARTED', 'ACTIVE', 'STOPPED'].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  try {
    const stationRes = await query(`SELECT * FROM attendance_stations WHERE id = $1`, [id]);
    if (stationRes.rows.length === 0) return res.status(404).json({ success: false, message: "Station not found" });

    await withTransaction(async (client: PoolClient) => {
      await client.query(`UPDATE attendance_stations SET status = $1 WHERE id = $2`, [status, id]);
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'STATION_STATUS_CHANGED', JSON.stringify({ station_id: id, status })
      ]);
    });

    res.json({ success: true, message: "Station status updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update station status" });
  }
});

router.get('/participant/:id', authenticateAttendanceScanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const participantRes = await query(`
      SELECT p.id, p.participant_id, p.name, p.contact, p.is_active, t.name as team_name, t.team_code
      FROM edge_participants p
      LEFT JOIN edge_teams t ON p.team_id = t.id
      WHERE p.participant_id = $1
    `, [id]);
    
    if (participantRes.rows.length === 0) return res.status(404).json({ error: "Participant not found" });

    const participationsRes = await query(`
      SELECT a.id, a.name 
      FROM edge_event_participations ep
      JOIN edge_activities a ON ep.activity_id = a.id
      WHERE ep.participant_id = $1
    `, [participantRes.rows[0].id]);

    res.json({ participant: participantRes.rows[0], participations: participationsRes.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch participant" });
  }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

router.get('/dashboard', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const tpRes = await query(`SELECT COUNT(*) as count FROM edge_participants WHERE is_active = true`);
    const totalParticipants = Number(tpRes.rows[0].count);
    
    const trRes = await query(`SELECT COUNT(*) as count FROM attendance_records`);
    const totalRecords = Number(trRes.rows[0].count);
    
    const generalStagesRes = await query(`
      SELECT 
        id, name, 'GENERAL' as stage_type, day, status,
        (SELECT COUNT(*) FROM attendance_records r WHERE r.stage_id = s.id) as present,
        (SELECT COUNT(*) FROM edge_participants WHERE is_active = true) as expected
      FROM attendance_stages s
      WHERE s.stage_type = 'GENERAL' AND s.is_active = true
    `);
    const generalStages = generalStagesRes.rows.map(r => ({
      ...r, present: Number(r.present), expected: Number(r.expected)
    }));

    const eventStagesRes = await query(`
      SELECT 
        s.id, s.name, 'EVENT' as stage_type, s.day, s.status, a.id as activity_id,
        (SELECT COUNT(*) FROM attendance_records r WHERE r.stage_id = s.id) as present,
        (SELECT COUNT(*) FROM edge_event_participations ep JOIN edge_participants p ON ep.participant_id = p.id WHERE ep.activity_id = a.id AND p.is_active = true) as expected
      FROM attendance_stages s
      JOIN attendance_stations st ON st.stage_id = s.id
      JOIN edge_activities a ON st.activity_id = a.id
      WHERE s.stage_type = 'EVENT' AND s.is_active = true
      GROUP BY s.id, a.id
    `);
    const eventStages = eventStagesRes.rows.map(r => ({
      ...r, present: Number(r.present), expected: Number(r.expected)
    }));

    const stageStats = [...generalStages, ...eventStages];

    const recentScansRes = await query(`
      SELECT r.id, p.name as participant_name, p.participant_id, s.name as stage_name, r.timestamp, st.name as station_name, r.attendance_method as method
      FROM attendance_records r
      JOIN edge_participants p ON r.participant_id = p.id
      JOIN attendance_stages s ON r.stage_id = s.id
      LEFT JOIN attendance_stations st ON r.station_id = st.id
      ORDER BY r.timestamp DESC
      LIMIT 10
    `);

    res.json({
      totalParticipants,
      totalRecords,
      stageStats,
      recentScans: recentScansRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

router.post('/stage/:id/finalize', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user.username;
  
  try {
    const result = await withTransaction(async (client: PoolClient) => {
      const stageRes = await client.query(`SELECT * FROM attendance_stages WHERE id = $1 FOR UPDATE`, [id]);
      if (stageRes.rows.length === 0) throw new Error("Stage not found");
      const stage = stageRes.rows[0];
      
      if (stage.status === 'FINALIZED') throw new Error("Stage already finalized");

      let expected = 0;
      if (stage.stage_type === 'GENERAL') {
        const expectedRes = await client.query(`SELECT COUNT(*) as count FROM edge_participants WHERE is_active = true`);
        expected = Number(expectedRes.rows[0].count);
      } else {
        const stationRes = await client.query(`SELECT activity_id FROM attendance_stations WHERE stage_id = $1 LIMIT 1`, [id]);
        if (stationRes.rows.length > 0 && stationRes.rows[0].activity_id) {
          const eRes = await client.query(`
            SELECT COUNT(*) as count FROM edge_event_participations ep 
            JOIN edge_participants p ON ep.participant_id = p.id 
            WHERE ep.activity_id = $1 AND p.is_active = true
          `, [stationRes.rows[0].activity_id]);
          expected = Number(eRes.rows[0].count);
        }
      }

      const pRes = await client.query(`SELECT COUNT(*) as count FROM attendance_records WHERE stage_id = $1`, [id]);
      const present = Number(pRes.rows[0].count);
      const absent = expected - present;

      await client.query(`UPDATE attendance_stages SET status = 'FINALIZED' WHERE id = $1`, [id]);
      await client.query(`
        INSERT INTO attendance_snapshots (stage_id, expected_count, present_count, absent_count, finalized_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, expected, present, absent, user]);

      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'STAGE_FINALIZED', JSON.stringify({ stage_id: id })
      ]);

      return { expected, present, absent };
    });
    
    res.json({ success: true, message: "Stage finalized successfully", data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to finalize stage" });
  }
});

router.post('/stage/:id/revert', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user.username;
  
  try {
    await withTransaction(async (client: PoolClient) => {
      const stageRes = await client.query(`SELECT * FROM attendance_stages WHERE id = $1 FOR UPDATE`, [id]);
      if (stageRes.rows.length === 0) throw new Error("Stage not found");
      const stage = stageRes.rows[0];
      
      if (stage.status !== 'FINALIZED') throw new Error("Stage is not finalized");

      await client.query(`UPDATE attendance_stages SET status = 'REOPENED' WHERE id = $1`, [id]);
      
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'STAGE_REVERTED', JSON.stringify({ stage_id: id })
      ]);
    });
    
    res.json({ success: true, message: "Stage reopened successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to revert stage" });
  }
});

router.get('/absentees', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { stage_id } = req.query;
  
  if (!stage_id) return res.status(400).json({ error: "stage_id is required" });

  try {
    const stageRes = await query(`SELECT * FROM attendance_stages WHERE id = $1`, [stage_id]);
    if (stageRes.rows.length === 0) return res.status(404).json({ error: "Stage not found" });
    const stage = stageRes.rows[0];

    let sql = '';
    let params: any[] = [];

    if (stage.stage_type === 'GENERAL') {
      sql = `
        SELECT p.id, p.participant_id, p.name, p.contact, t.name as team_name, t.team_code
        FROM edge_participants p
        LEFT JOIN edge_teams t ON p.team_id = t.id
        WHERE p.is_active = true
        AND p.id NOT IN (SELECT participant_id FROM attendance_records WHERE stage_id = $1)
      `;
      params = [stage_id];
    } else {
      const stationRes = await query(`SELECT activity_id FROM attendance_stations WHERE stage_id = $1 LIMIT 1`, [stage_id]);
      if (stationRes.rows.length === 0 || !stationRes.rows[0].activity_id) return res.status(400).json({ error: "Misconfigured event stage" });
      
      sql = `
        SELECT p.id, p.participant_id, p.name, p.contact, t.name as team_name, t.team_code
        FROM edge_participants p
        JOIN edge_event_participations ep ON p.id = ep.participant_id
        LEFT JOIN edge_teams t ON p.team_id = t.id
        WHERE p.is_active = true AND ep.activity_id = $1
        AND p.id NOT IN (SELECT participant_id FROM attendance_records WHERE stage_id = $2)
      `;
      params = [stationRes.rows[0].activity_id, stage_id];
    }

    const absenteesRes = await query(sql, params);
    res.json({ absentees: absenteesRes.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch absentees" });
  }
});

router.get('/participant/:id/history', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const pRes = await query(`
      SELECT p.id, p.participant_id, p.name, p.contact, t.team_code 
      FROM edge_participants p 
      LEFT JOIN edge_teams t ON p.team_id = t.id 
      WHERE p.participant_id = $1
    `, [id]);
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Participant not found" });
    const p = pRes.rows[0];

    const generalStagesRes = await query(`SELECT id, name, day, 'GENERAL' as category FROM attendance_stages WHERE stage_type = 'GENERAL' AND is_active = true`);
    
    const eventStagesRes = await query(`
      SELECT s.id, s.name, s.day, a.name as category 
      FROM attendance_stages s
      JOIN attendance_stations st ON s.id = st.stage_id
      JOIN edge_event_participations ep ON st.activity_id = ep.activity_id
      JOIN edge_activities a ON a.id = ep.activity_id
      WHERE s.stage_type = 'EVENT' AND s.is_active = true AND ep.participant_id = $1
      GROUP BY s.id, a.name
    `, [p.id]);

    const expectedStages = [...generalStagesRes.rows, ...eventStagesRes.rows];
    const recordsRes = await query(`SELECT stage_id, timestamp, attendance_method as method FROM attendance_records WHERE participant_id = $1`, [p.id]);
    const records = recordsRes.rows;

    const history = expectedStages.map(st => {
      const rec = records.find(r => r.stage_id === st.id);
      return {
        stage_name: st.name,
        category: st.category,
        day: st.day,
        status: rec ? 'Present' : 'Absent',
        timestamp: rec ? rec.timestamp : null,
        method: rec ? rec.method : null
      };
    });

    res.json({ participant: p, history });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

router.get('/qr-book', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const participantsRes = await query(`
      SELECT p.id, p.participant_id, p.name, p.contact, p.team_id, t.name as team_name, t.team_code
      FROM edge_participants p
      LEFT JOIN edge_teams t ON p.team_id = t.id
      WHERE p.is_active = true
      ORDER BY t.name ASC, p.name ASC
    `);

    const participationsRes = await query(`
      SELECT ep.participant_id, a.name as activity_name 
      FROM edge_event_participations ep
      JOIN edge_activities a ON ep.activity_id = a.id
    `);

    const grouped: any = {};
    for (const p of participantsRes.rows) {
      const teamLabel = p.team_name || 'No Team';
      if (!grouped[teamLabel]) {
        grouped[teamLabel] = {
          team_id: p.team_id || null,
          team_code: p.team_code || null,
          participants: []
        };
      }
      p.events = participationsRes.rows.filter(ep => String(ep.participant_id) === String(p.id)).map(ep => ep.activity_name);
      grouped[teamLabel].participants.push(p);
    }

    res.json({ success: true, data: grouped });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to fetch QR book data", error: err.message });
  }
});

router.post('/import-preview', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    
    const epRes = await query(`SELECT * FROM edge_participants`);
    const existingParticipants = epRes.rows;
    
    const etRes = await query(`SELECT * FROM edge_teams`);
    const existingTeams = etRes.rows;
    
    const aRes = await query(`SELECT id, name FROM edge_activities`);
    const activities = aRes.rows;
    
    const preview = {
      valid: [] as any[],
      conflicts: [] as any[],
      warnings: [] as any[],
      summary: { 
        participants: 0, 
        teams: new Set(), 
        events: new Set(),
        qrReused: 0,
        qrGenerated: 0
      }
    };

    let inheritedTeamName = '';
    let inheritedTeamCode = '';
    let processedRows: any[] = [];
    const seenIds = new Set();
    const seenCombos = new Set();

    const normalizeYesNo = (val: any) => {
      if (!val) return 'No';
      const s = String(val).trim().toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(s)) return 'Yes';
      if (['no', 'n', 'false', '0', ''].includes(s)) return 'No';
      return 'Invalid';
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let hasConflict = false;
      let hasWarning = false;
      let conflictReason: string[] = [];

      let rawTeamName = row.team_name || '';
      let rawTeamCode = row.team_code || '';

      if (rawTeamName || rawTeamCode) {
        inheritedTeamName = rawTeamName;
        inheritedTeamCode = rawTeamCode;
      }

      const resolvedTeamName = inheritedTeamName;
      const resolvedTeamCode = inheritedTeamCode;

      if (!resolvedTeamName && !resolvedTeamCode) {
        hasConflict = true;
        conflictReason.push("Team could not be determined.");
      }

      let qr_status = 'Missing';
      let qr_action = 'Generate';
      let existingParticipant = null;

      if (row.participant_id) {
        if (seenIds.has(row.participant_id)) {
          hasConflict = true;
          conflictReason.push(`Duplicate Participant ID within Excel file: ${row.participant_id}`);
        }
        seenIds.add(row.participant_id);
        existingParticipant = existingParticipants.find(p => p.participant_id === row.participant_id);
      } else {
        const combo = `${row.name}-${row.contact}`;
        if (seenCombos.has(combo)) {
          hasConflict = true;
          conflictReason.push(`Duplicate Name/Contact combination within Excel file: ${row.name}`);
        }
        seenCombos.add(combo);
        const matches = existingParticipants.filter(p => p.name.toLowerCase() === row.name.toLowerCase() && p.contact === row.contact);
        if (matches.length === 1) {
          existingParticipant = matches[0];
          row.participant_id = existingParticipant.participant_id; // Set it so it gets reused
        } else if (matches.length > 1) {
          hasConflict = true;
          conflictReason.push("Ambiguous identity: multiple matching records found.");
        }
      }

      if (existingParticipant) {
        qr_status = 'Existing';
        qr_action = 'Reuse';
        preview.summary.qrReused++;
        if (resolvedTeamName && existingParticipant.team_id) {
          const extTeam = existingTeams.find(t => t.id === existingParticipant.team_id);
          if (extTeam && extTeam.name !== resolvedTeamName) {
            hasWarning = true;
            conflictReason.push(`Team change from ${extTeam.name} to ${resolvedTeamName}`);
          }
        }
        if (row.contact && existingParticipant.contact && row.contact !== existingParticipant.contact) {
            hasConflict = true;
            conflictReason.push(`Contact mismatch: Existing (${existingParticipant.contact}) vs Excel (${row.contact})`);
        }
      } else {
        preview.summary.qrGenerated++;
      }

      const eArth = normalizeYesNo(row.event_arthneeti);
      const eFin = normalizeYesNo(row.event_finance);
      const eBrand = normalizeYesNo(row.event_brand);
      const eBull = normalizeYesNo(row.event_bull);
      const eAi = normalizeYesNo(row.event_ai);

      const resolvedEvents: string[] = [];

      const checkEvent = (val: string, name: string) => {
        if (val === 'Yes') resolvedEvents.push(name);
        else if (val === 'Invalid') {
           hasWarning = true; 
           conflictReason.push(`Invalid value for ${name}`);
        }
      };

      checkEvent(eArth, 'Arthneeti');
      checkEvent(eFin, 'Finance Ka Funda');
      checkEvent(eBrand, 'Brand Bazigaar');
      checkEvent(eBull, 'Bull Ring');
      checkEvent(eAi, 'AI Ki Baat Cheet');

      for (const ev of resolvedEvents) preview.summary.events.add(ev);
      if (resolvedTeamName) preview.summary.teams.add(resolvedTeamName);

      processedRows.push({
        row_index: i + 2,
        ...row,
        events: resolvedEvents,
        raw_team: rawTeamName || rawTeamCode || 'Blank',
        resolved_team_name: resolvedTeamName,
        resolved_team_code: resolvedTeamCode,
        qr_status,
        qr_action,
        hasConflict,
        hasWarning,
        reasons: conflictReason
      });
    }

    const teamSizes: Record<string, number> = {};
    for (const r of processedRows) {
      if (r.resolved_team_name) {
        teamSizes[r.resolved_team_name] = (teamSizes[r.resolved_team_name] || 0) + 1;
      }
    }

    for (const r of processedRows) {
      if (r.resolved_team_name && teamSizes[r.resolved_team_name] !== 6) {
        r.hasWarning = true;
        r.reasons.push(`Expected team size: 6, found ${teamSizes[r.resolved_team_name]}`);
      }

      const status = r.hasConflict ? 'Conflict' : (r.hasWarning ? 'Warning' : 'Valid');
      r.status = status;

      if (r.hasConflict) preview.conflicts.push(r);
      else if (r.hasWarning) preview.warnings.push(r);
      else preview.valid.push(r);
      
      preview.summary.participants++;
    }

    res.json({ success: true, preview: { ...preview, summary: { ...preview.summary, teams: preview.summary.teams.size, events: preview.summary.events.size } } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Preview generation failed", error: err.message });
  }
});

router.post('/import-commit', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    const user = (req as any).user.username;

    await withTransaction(async (client: PoolClient) => {
      const epRes = await client.query(`SELECT * FROM edge_participants`);
      const existingParticipants = epRes.rows;
      
      const aRes = await client.query(`SELECT id, name FROM edge_activities`);
      const activities = aRes.rows;
      
      let maxSuffix = 0;
      for (const p of existingParticipants) {
        const match = p.participant_id.match(/^EDG26-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSuffix) maxSuffix = num;
        }
      }

      const rollbackData = {
        insertedParticipants: [] as number[],
        updatedParticipants: [] as any[],
        insertedTeams: [] as number[],
        insertedParticipations: [] as { p_id: number, a_id: number }[]
      };

      for (const row of rows) {
        let teamId = null;
        let rTeamName = row.resolved_team_name;
        let rTeamCode = row.resolved_team_code;
        
        if (rTeamName) {
          const teamRowRes = await client.query(`SELECT id FROM edge_teams WHERE name = $1`, [rTeamName]);
          let teamRow = teamRowRes.rows[0];
          
          if (!teamRow && rTeamCode) {
             const tcrRes = await client.query(`SELECT id FROM edge_teams WHERE team_code = $1`, [rTeamCode]);
             teamRow = tcrRes.rows[0];
          }
          
          if (teamRow) {
            teamId = teamRow.id;
          } else {
            const tr = await client.query(`INSERT INTO edge_teams (name, team_code) VALUES ($1, $2) RETURNING id`, [rTeamName, rTeamCode || null]);
            teamId = tr.rows[0].id;
            rollbackData.insertedTeams.push(Number(teamId));
          }
        }

        let participantId = row.participant_id;
        let dbParticipantId = null;

        if (participantId) {
          const existing = existingParticipants.find(p => p.participant_id === participantId);
          if (existing) {
            rollbackData.updatedParticipants.push({
              id: existing.id,
              name: existing.name,
              contact: existing.contact,
              team_id: existing.team_id
            });
            await client.query(`UPDATE edge_participants SET name = $1, contact = $2, team_id = $3 WHERE participant_id = $4`, [row.name, row.contact || null, teamId, participantId]);
            dbParticipantId = existing.id;
          }
        }

        if (!dbParticipantId) {
          maxSuffix++;
          participantId = `EDG26-${maxSuffix.toString().padStart(3, '0')}`;
          const pr = await client.query(`INSERT INTO edge_participants (participant_id, name, contact, team_id) VALUES ($1, $2, $3, $4) RETURNING id`, [participantId, row.name, row.contact || null, teamId]);
          dbParticipantId = pr.rows[0].id;
          rollbackData.insertedParticipants.push(Number(dbParticipantId));
          existingParticipants.push({ 
            id: dbParticipantId, 
            participant_id: participantId, 
            name: row.name, 
            contact: row.contact || null, 
            team_id: teamId 
          });
        }

        if (row.events && Array.isArray(row.events)) {
          // Clear existing participations to ensure we reflect exactly the latest Excel mapping
          await client.query(`DELETE FROM edge_event_participations WHERE participant_id = $1`, [dbParticipantId]);
          
          for (const ev of row.events) {
            const act = activities.find(a => a.name.toLowerCase() === ev.toLowerCase());
            if (act) {
              await client.query(`INSERT INTO edge_event_participations (participant_id, activity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dbParticipantId, act.id]);
              rollbackData.insertedParticipations.push({ p_id: Number(dbParticipantId), a_id: act.id });
            }
          }
        }
      }

      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'EXCEL_IMPORT_COMMITTED', JSON.stringify({ rows: rows.length, rollbackData })
      ]);
    });

    res.json({ success: true, message: "Import completed successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Import failed", error: err.message });
  }
});

router.post('/import-undo', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user.username;

    await withTransaction(async (client: PoolClient) => {
      const logRes = await client.query(`
        SELECT id, metadata FROM attendance_audit_logs 
        WHERE action = 'EXCEL_IMPORT_COMMITTED' 
        ORDER BY created_at DESC LIMIT 1
      `);
      if (logRes.rows.length === 0) throw new Error("No recent import found to undo.");
      const log = logRes.rows[0];

      const metadata = JSON.parse(log.metadata);
      if (!metadata.rollbackData) throw new Error("The most recent import does not contain rollback data.");

      const { insertedParticipants, updatedParticipants, insertedTeams, insertedParticipations } = metadata.rollbackData;

      if (insertedParticipations && insertedParticipations.length > 0) {
        for (const ep of insertedParticipations) {
          await client.query(`DELETE FROM edge_event_participations WHERE participant_id = $1 AND activity_id = $2`, [ep.p_id, ep.a_id]);
        }
      }

      if (insertedParticipants && insertedParticipants.length > 0) {
        for (const id of insertedParticipants) {
          await client.query(`DELETE FROM edge_participants WHERE id = $1`, [id]);
        }
      }

      if (updatedParticipants && updatedParticipants.length > 0) {
        for (const p of updatedParticipants) {
          await client.query(`UPDATE edge_participants SET name = $1, contact = $2, team_id = $3 WHERE id = $4`, [p.name, p.contact, p.team_id, p.id]);
        }
      }

      if (insertedTeams && insertedTeams.length > 0) {
        for (const id of insertedTeams) {
          const cRes = await client.query(`SELECT COUNT(*) as count FROM edge_participants WHERE team_id = $1`, [id]);
          if (Number(cRes.rows[0].count) === 0) {
            await client.query(`DELETE FROM edge_teams WHERE id = $1`, [id]);
          }
        }
      }

      await client.query(`UPDATE attendance_audit_logs SET action = 'EXCEL_IMPORT_REVERTED' WHERE id = $1`, [log.id]);
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'EXCEL_IMPORT_REVERTED_LOG', JSON.stringify({ reverted_log_id: log.id })
      ]);
    });

    res.json({ success: true, message: "Last import successfully undone." });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Undo failed", error: err.message });
  }
});

router.delete('/participant/:id', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user.username;
  try {
    const pRes = await query(`SELECT participant_id FROM edge_participants WHERE id = $1`, [id]);
    if (pRes.rows.length === 0) return res.status(404).json({ success: false, message: "Participant not found" });
    const participant = pRes.rows[0];

    await withTransaction(async (client: PoolClient) => {
      await client.query(`DELETE FROM edge_participants WHERE id = $1`, [id]);
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'PARTICIPANT_DELETED', JSON.stringify({ participant_id: participant.participant_id })
      ]);
    });
    res.json({ success: true, message: "Participant deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to delete participant", error: err.message });
  }
});

router.delete('/team/:id', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user.username;
  try {
    const tRes = await query(`SELECT name FROM edge_teams WHERE id = $1`, [id]);
    if (tRes.rows.length === 0) return res.status(404).json({ success: false, message: "Team not found" });
    const team = tRes.rows[0];

    await withTransaction(async (client: PoolClient) => {
      await client.query(`DELETE FROM edge_participants WHERE team_id = $1`, [id]);
      await client.query(`DELETE FROM edge_teams WHERE id = $1`, [id]);
      
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'TEAM_DELETED', JSON.stringify({ team_id: id, team_name: team.name })
      ]);
    });
    res.json({ success: true, message: "Team and all its participants deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to delete team", error: err.message });
  }
});

router.post('/id-template', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const { image_data, config_data } = req.body;
    await query(`INSERT INTO edge_id_templates (image_data, config_data) VALUES ($1, $2)`, [image_data, JSON.stringify(config_data)]);
    res.json({ success: true, message: "Template saved" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to save template" });
  }
});

router.get('/id-template', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const tRes = await query(`SELECT * FROM edge_id_templates ORDER BY created_at DESC LIMIT 1`);
    if (tRes.rows.length === 0) return res.json({ success: false, message: "No template found" });
    const t = tRes.rows[0];
    t.config_data = JSON.parse(t.config_data);
    res.json({ success: true, template: t });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to fetch template" });
  }
});

router.get('/audit', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  try {
    const recordsRes = await query(`
      SELECT 
        r.id,
        r.timestamp,
        p.participant_id,
        p.name as participant_name,
        p.contact,
        t.team_code,
        st.stage_type as attendance_category,
        a.name as event_name,
        st.day,
        s.name as station,
        'Present' as attendance_status,
        r.attendance_method as action_type,
        'Scanner' as marked_by,
        'Recorded successfully' as audit_remarks
      FROM attendance_records r
      JOIN edge_participants p ON r.participant_id = p.id
      LEFT JOIN edge_teams t ON p.team_id = t.id
      JOIN attendance_stages st ON r.stage_id = st.id
      LEFT JOIN attendance_stations s ON r.station_id = s.id
      LEFT JOIN edge_activities a ON st.stage_type = 'EVENT' AND s.activity_id = a.id
      ORDER BY r.timestamp DESC
    `);
    
    // Also include logs from attendance_audit_logs if needed, but the requirement specifies 
    // a table of attendance activity with specific columns.
    
    res.json({ success: true, logs: recordsRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
});

router.post('/end-day', authenticateAttendanceAdmin, async (req: Request, res: Response) => {
  const user = (req as any).user.username;
  try {
    await withTransaction(async (client: PoolClient) => {
      // Lock active stations for the current day
      await client.query(`UPDATE attendance_stations SET status = 'STOPPED' WHERE status = 'ACTIVE'`);
      
      // Log DAY_ENDED
      await client.query(`INSERT INTO attendance_audit_logs (actor, action, metadata) VALUES ($1, $2, $3)`, [
        user, 'DAY_ENDED', JSON.stringify({ timestamp: new Date().toISOString() })
      ]);
    });
    res.json({ success: true, message: "Day ended successfully. Active stations stopped." });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Failed to end day" });
  }
});

export default router;
