import express from 'express';
import { pool } from '../database.js';

const router = express.Router();

// ==================== BACKUP & RESTAURAR ====================

// Descargar backup completo de la base de datos
router.get('/backup', async (req, res) => {
  try {
    const [clientes, tratamientos, turnos, promociones, bloqueos, legajos, testimonios] = await Promise.all([
      pool.query('SELECT * FROM clientes ORDER BY id'),
      pool.query('SELECT * FROM tratamientos ORDER BY id'),
      pool.query('SELECT * FROM turnos ORDER BY id'),
      pool.query('SELECT * FROM promociones ORDER BY id'),
      pool.query('SELECT * FROM bloqueos ORDER BY id'),
      pool.query('SELECT * FROM legajos ORDER BY id'),
      pool.query('SELECT * FROM testimonios ORDER BY id')
    ]);

    const backup = {
      fecha: new Date().toISOString(),
      version: '1.0',
      datos: {
        clientes: clientes.rows,
        tratamientos: tratamientos.rows,
        turnos: turnos.rows,
        promociones: promociones.rows,
        bloqueos: bloqueos.rows,
        legajos: legajos.rows,
        testimonios: testimonios.rows
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=backup-hairstyle-' + new Date().toISOString().split('T')[0] + '.json');
    res.json(backup);
  } catch (error) {
    console.error('Error generando backup:', error);
    res.status(500).json({ error: 'Error generando backup' });
  }
});

// Restaurar backup
router.post('/backup/restaurar', async (req, res) => {
  try {
    const { datos } = req.body;
    if (!datos || !datos.clientes) {
      return res.status(400).json({ error: 'Archivo de backup inválido' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Limpiar tablas en orden (respetar foreign keys)
      await client.query('DELETE FROM testimonios');
      await client.query('DELETE FROM legajos');
      await client.query('DELETE FROM turnos');
      await client.query('DELETE FROM bloqueos');
      await client.query('DELETE FROM promociones');
      await client.query('DELETE FROM clientes');
      await client.query('DELETE FROM tratamientos');

      // Restaurar tratamientos
      for (const t of datos.tratamientos) {
        await client.query(
          'INSERT INTO tratamientos (id, nombre, precio, duracion, descripcion, imagen_url, activo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
          [t.id, t.nombre, t.precio, t.duracion, t.descripcion, t.imagen_url, t.activo, t.created_at, t.updated_at]
        );
      }

      // Restaurar clientes
      for (const c of datos.clientes) {
        await client.query(
          'INSERT INTO clientes (id, username, nombre, telefono, email, password, activo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
          [c.id, c.username, c.nombre, c.telefono, c.email, c.password, c.activo, c.created_at, c.updated_at]
        );
      }

      // Restaurar turnos
      for (const t of datos.turnos) {
        await client.query(
          'INSERT INTO turnos (id, cliente_id, tratamiento_id, fecha, hora, estado, notas, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
          [t.id, t.cliente_id, t.tratamiento_id, t.fecha, t.hora, t.estado, t.notas, t.created_at, t.updated_at]
        );
      }

      // Restaurar promociones
      for (const p of datos.promociones || []) {
        await client.query(
          'INSERT INTO promociones (id, titulo, descripcion, descuento, precio_especial, fecha_inicio, fecha_fin, imagen_url, activo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING',
          [p.id, p.titulo, p.descripcion, p.descuento, p.precio_especial, p.fecha_inicio, p.fecha_fin, p.imagen_url, p.activo, p.created_at, p.updated_at]
        );
      }

      // Restaurar bloqueos
      for (const b of datos.bloqueos || []) {
        await client.query(
          'INSERT INTO bloqueos (id, fecha, hora, todo_el_dia, motivo, activo, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
          [b.id, b.fecha, b.hora, b.todo_el_dia, b.motivo, b.activo, b.created_at]
        );
      }

      // Restaurar legajos
      for (const l of datos.legajos || []) {
        await client.query(
          'INSERT INTO legajos (id, cliente_id, tratamiento, tipo, fecha, datos, activo, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
          [l.id, l.cliente_id, l.tratamiento, l.tipo, l.fecha, l.datos, l.activo, l.created_at]
        );
      }

      // Restaurar testimonios
      for (const t of datos.testimonios || []) {
        await client.query(
          'INSERT INTO testimonios (id, cliente_id, texto, calificacion, aprobado, activo, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
          [t.id, t.cliente_id, t.texto, t.calificacion, t.aprobado, t.activo, t.created_at]
        );
      }

      // Actualizar secuencias
      await client.query("SELECT setval('clientes_id_seq', (SELECT COALESCE(MAX(id),0) FROM clientes))");
      await client.query("SELECT setval('tratamientos_id_seq', (SELECT COALESCE(MAX(id),0) FROM tratamientos))");
      await client.query("SELECT setval('turnos_id_seq', (SELECT COALESCE(MAX(id),0) FROM turnos))");
      await client.query("SELECT setval('promociones_id_seq', (SELECT COALESCE(MAX(id),0) FROM promociones))");
      await client.query("SELECT setval('bloqueos_id_seq', (SELECT COALESCE(MAX(id),0) FROM bloqueos))");
      await client.query("SELECT setval('legajos_id_seq', (SELECT COALESCE(MAX(id),0) FROM legajos))");
      await client.query("SELECT setval('testimonios_id_seq', (SELECT COALESCE(MAX(id),0) FROM testimonios))");

      await client.query('COMMIT');
      res.json({ success: true, message: 'Backup restaurado correctamente' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error restaurando backup:', error);
    res.status(500).json({ error: 'Error restaurando backup: ' + error.message });
  }
});

// ==================== CLIENTES ====================

// Obtener todos los clientes
router.get('/clientes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, COALESCE(username, '') as username, nombre, telefono, email, activo, created_at 
      FROM clientes 
      WHERE activo = TRUE 
      ORDER BY nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener clientes con contraseñas (solo para admin)
router.get('/clientes/passwords', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, COALESCE(username, '') as username, nombre, telefono, password 
      FROM clientes 
      WHERE activo = TRUE 
      ORDER BY nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo clientes con passwords:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear nuevo cliente
router.post('/clientes', async (req, res) => {
  try {
    const { nombre, telefono, email } = req.body;
    
    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
    }

    const result = await pool.query(
      'INSERT INTO clientes (nombre, telefono, email) VALUES ($1, $2, $3) RETURNING *',
      [nombre, telefono, email || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando cliente:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ya existe un cliente con ese teléfono' });
    } else {
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
});

// Actualizar cliente
router.put('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, email } = req.body;
    
    const result = await pool.query(
      'UPDATE clientes SET nombre = $1, telefono = $2, email = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [nombre, telefono, email || null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar cliente
router.delete('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Primero eliminar turnos asociados
    await pool.query('DELETE FROM turnos WHERE cliente_id = $1', [id]);
    
    const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== BLOQUEOS ====================

router.get('/bloqueos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bloqueos WHERE activo = TRUE ORDER BY fecha, hora');
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo bloqueos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/bloqueos', async (req, res) => {
  try {
    const { fecha, hora, todo_el_dia, motivo } = req.body;
    if (!fecha) {
      return res.status(400).json({ error: 'Fecha es requerida' });
    }
    const result = await pool.query(
      'INSERT INTO bloqueos (fecha, hora, todo_el_dia, motivo) VALUES ($1, $2, $3, $4) RETURNING *',
      [fecha, hora || null, todo_el_dia || false, motivo || null]
    );
    res.status(201).json({ success: true, bloqueo: result.rows[0] });
  } catch (error) {
    console.error('Error creando bloqueo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/bloqueos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bloqueos WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bloqueo no encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando bloqueo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== TRATAMIENTOS ====================

router.get('/tratamientos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tratamientos WHERE activo = TRUE ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tratamientos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/tratamientos', async (req, res) => {
  try {
    const { nombre, precio, duracion, descripcion, imagen_url } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'Nombre es requerido' });
    }
    const result = await pool.query(
      'INSERT INTO tratamientos (nombre, precio, duracion, descripcion, imagen_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre, precio || 0, duracion || 60, descripcion || null, imagen_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando tratamiento:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/tratamientos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, duracion, descripcion, imagen_url, activo } = req.body;
    const result = await pool.query(
      'UPDATE tratamientos SET nombre = $1, precio = $2, duracion = $3, descripcion = $4, imagen_url = $5, activo = COALESCE($6, activo), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [nombre, precio, duracion, descripcion, imagen_url, activo, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tratamiento no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando tratamiento:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/tratamientos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE tratamientos SET activo = FALSE WHERE id = $1', [id]);
    res.json({ message: 'Tratamiento eliminado' });
  } catch (error) {
    console.error('Error eliminando tratamiento:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== TURNOS ====================

router.get('/cliente/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        t.id,
        t.fecha,
        t.hora,
        t.estado,
        t.notas,
        tr.nombre as tratamiento,
        tr.precio as tratamiento_precio
      FROM turnos t
      JOIN tratamientos tr ON t.tratamiento_id = tr.id
      WHERE t.cliente_id = $1
      ORDER BY t.fecha DESC, t.hora DESC
    `, [id]);
    
    res.json({ success: true, turnos: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: false, turnos: [] });
  }
});

// Obtener todos los turnos con información de cliente y tratamiento
router.get('/turnos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        tr.nombre as tratamiento_nombre,
        tr.precio as tratamiento_precio,
        tr.duracion as tratamiento_duracion
      FROM turnos t
      JOIN clientes c ON t.cliente_id = c.id
      JOIN tratamientos tr ON t.tratamiento_id = tr.id
      ORDER BY t.fecha DESC, t.hora DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo turnos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener horarios ocupados para una fecha específica
router.get('/turnos/fecha/:fecha', async (req, res) => {
  try {
    const { fecha } = req.params;
    
    // Obtener bloqueos del día
    const bloqueosResult = await pool.query(
      'SELECT * FROM bloqueos WHERE fecha = $1 AND activo = TRUE',
      [fecha]
    );
    
    // Obtener turnos del día
    const turnosResult = await pool.query(`
      SELECT 
        t.hora,
        tr.duracion as tratamiento_duracion,
        tr.nombre as tratamiento_nombre,
        c.nombre as cliente_nombre
      FROM turnos t
      JOIN tratamientos tr ON t.tratamiento_id = tr.id
      JOIN clientes c ON t.cliente_id = c.id
      WHERE t.fecha = $1 AND t.estado != 'cancelado'
      ORDER BY t.hora
    `, [fecha]);
    
    res.json({
      turnos: turnosResult.rows,
      bloqueos: bloqueosResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo horarios ocupados:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear nuevo turno
router.post('/turnos', async (req, res) => {
  try {
    const { cliente_id, tratamiento_id, fecha, hora, notas, precio, duracion } = req.body;
    
    if (!cliente_id || !tratamiento_id || !fecha || !hora) {
      return res.status(400).json({ error: 'Cliente, tratamiento, fecha y hora son requeridos' });
    }

    // Obtener la duración del tratamiento
    const tratResult = await pool.query('SELECT nombre, duracion FROM tratamientos WHERE id = $1', [tratamiento_id]);
    if (tratResult.rows.length === 0) {
      return res.status(400).json({ error: 'Tratamiento no encontrado' });
    }
    
    // Verificar bloqueos
    const bloqueos = await pool.query(
      'SELECT * FROM bloqueos WHERE fecha = $1 AND activo = TRUE',
      [fecha]
    );
    
    const bloqueoTotal = bloqueos.rows.find(b => b.todo_el_dia);
    if (bloqueoTotal) {
      return res.status(400).json({ 
        error: 'No se puede agendar turno: ' + (bloqueoTotal.motivo || 'Día bloqueado por el administrador')
      });
    }
    
    const bloqueoHora = bloqueos.rows.find(b => b.hora === hora);
    if (bloqueoHora) {
      return res.status(400).json({ 
        error: 'No se puede agendar turno: ' + (bloqueoHora.motivo || 'Horario bloqueado por el administrador')
      });
    }
    
    // Verificar que no haya conflicto de horarios (por duración del tratamiento)
    const duracionTurno = parseInt(tratResult.rows[0].duracion || 60);
    
    const existentes = await pool.query(`
      SELECT t.id, t.hora, tr.duracion as tratamiento_duracion
      FROM turnos t
      JOIN tratamientos tr ON t.tratamiento_id = tr.id
      WHERE t.fecha = $1 AND t.estado != 'cancelado'
    `, [fecha]);
    
    function toMin(h) {
      if (!h) return 0;
      var parts = h.split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
    }
    
    var inicioNuevo = toMin(hora);
    var finNuevo = inicioNuevo + duracionTurno;
    var conflicto = false;
    
    existentes.rows.forEach(function(e) {
      var inicioExist = toMin(e.hora);
      var finExist = inicioExist + parseInt(e.tratamiento_duracion || 60);
      if (inicioNuevo < finExist && finNuevo > inicioExist) {
        conflicto = true;
      }
    });
    
    if (conflicto) {
      return res.status(400).json({ 
        error: 'Ya hay un turno agendado en ese horario.'
      });
    }

    // Si hay precio especial (alisado por cm), actualizar las notas
    var notasFinales = notas || null;
    if (precio) {
      notasFinales = (notas || '') + ' [PRECIO ESPECIAL: $' + precio + ']';
    }

    const result = await pool.query(
      'INSERT INTO turnos (cliente_id, tratamiento_id, fecha, hora, notas) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [cliente_id, tratamiento_id, fecha, hora, notasFinales]
    );
    
    // Obtener información completa del turno creado
    const turnoCompleto = await pool.query(`
      SELECT 
        t.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        tr.nombre as tratamiento_nombre,
        tr.precio as tratamiento_precio,
        tr.duracion as tratamiento_duracion
      FROM turnos t
      JOIN clientes c ON t.cliente_id = c.id
      JOIN tratamientos tr ON t.tratamiento_id = tr.id
      WHERE t.id = $1
    `, [result.rows[0].id]);
    
    const turno = turnoCompleto.rows[0];

    // La notificación a la administradora se genera desde el cliente vía wa.me.
    // El servidor NO envía ni simula envíos de WhatsApp.
    res.status(201).json({
      ...result.rows[0],
      cliente: turno.cliente_nombre,
      telefono: turno.cliente_telefono,
      servicio: turno.tratamiento_nombre
    });
  } catch (error) {
    console.error('Error creando turno:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar turno (estado, fecha, hora)
router.patch('/turnos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, fecha, hora } = req.body;
    
    let query = 'UPDATE turnos SET updated_at = CURRENT_TIMESTAMP';
    let params = [];
    let paramIndex = 1;
    
    if (estado) {
      query += ', estado = $' + paramIndex;
      params.push(estado);
      paramIndex++;
    }
    if (fecha) {
      query += ', fecha = $' + paramIndex;
      params.push(fecha);
      paramIndex++;
    }
    if (hora) {
      query += ', hora = $' + paramIndex;
      params.push(hora);
      paramIndex++;
    }
    
    query += ' WHERE id = $' + paramIndex + ' RETURNING *';
    params.push(id);
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    
    res.json({ success: true, turno: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando turno:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar turno completo
router.put('/turnos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_id, tratamiento_id, fecha, hora, notas, estado } = req.body;
    
    const result = await pool.query(
      'UPDATE turnos SET cliente_id = $1, tratamiento_id = $2, fecha = $3, hora = $4, notas = $5, estado = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [cliente_id, tratamiento_id, fecha, hora, notas, estado || 'pendiente', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando turno:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar turno
router.delete('/turnos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM turnos WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    
    res.json({ message: 'Turno eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando turno:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== PROMOCIONES ====================

router.get('/promociones', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM promociones WHERE activo = TRUE ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo promociones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/promociones', async (req, res) => {
  try {
    const { titulo, descripcion, precio_especial, fecha_inicio, fecha_fin, imagen_url } = req.body;
    if (!titulo) {
      return res.status(400).json({ error: 'Titulo es requerido' });
    }
    const result = await pool.query(
      'INSERT INTO promociones (titulo, descripcion, precio_especial, fecha_inicio, fecha_fin, imagen_url, activo) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING *',
      [titulo, descripcion || null, precio_especial || null, fecha_inicio || null, fecha_fin || null, imagen_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando promocion:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/promociones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE promociones SET activo = FALSE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando promocion:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== GALERIA ====================

// ==================== CONFIG PRECIOS ALISADOS ====================

router.get('/config/precios-alisados', async (req, res) => {
  try {
    const result = await pool.query("SELECT descripcion FROM tratamientos WHERE nombre ILIKE '%alisado%' OR nombre ILIKE '%tratamiento%' LIMIT 1");
    if (result.rows.length > 0 && result.rows[0].descripcion) {
      try {
        var precios = JSON.parse(result.rows[0].descripcion);
        if (precios['0-30']) return res.json(precios);
      } catch(e) {}
    }
    // Default prices
    res.json({"0-30":32000,"30-40":34000,"40-50":36000,"50-60":38000,"60-70":40000,"70-80":42000,"80-90":44000});
  } catch (error) {
    res.json({"0-30":32000,"30-40":34000,"40-50":36000,"50-60":38000,"60-70":40000,"70-80":42000,"80-90":44000});
  }
});

router.put('/config/precios-alisados', async (req, res) => {
  try {
    const precios = req.body;
    const preciosStr = JSON.stringify(precios);
    // Intentar actualizar
    const result = await pool.query("UPDATE tratamientos SET descripcion = $1 WHERE nombre ILIKE '%alisado%' OR nombre ILIKE '%tratamiento%'", [preciosStr]);
    if (result.rowCount === 0) {
      // Si no hay registro de alisados, crear uno
      await pool.query("INSERT INTO tratamientos (nombre, precio, duracion, descripcion, activo) VALUES ('Alisados', 0, 120, $1, TRUE)", [preciosStr]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando precios alisados:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== CONFIG CONTACTO ====================

// Número de WhatsApp de la administradora, definido por variable de entorno.
// Se usa para las notificaciones de turnos (wa.me desde el cliente).
router.get('/config/contacto', (req, res) => {
  const whatsappAdmin = String(process.env.ADMIN_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
  res.json({ whatsappAdmin });
});

// ==================== GALERIA ====================

router.get('/galeria', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM galeria WHERE activo = TRUE ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting galeria:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Agregar foto a galería
router.post('/galeria', async (req, res) => {
  try {
    const { categoria, nombre, imagen_url } = req.body;
    
    const titulo = nombre || req.body.titulo;
    const url = imagen_url || req.body.url;
    
    if (!categoria || !titulo || !url) {
      return res.status(400).json({ error: 'Categoría, título e imagen son requeridos' });
    }
    
    const result = await pool.query(
      'INSERT INTO galeria (titulo, categoria, imagen_url, activo) VALUES ($1, $2, $3, $4) RETURNING *',
      [titulo, categoria, url, true]
    );
    
    res.status(201).json({
      success: true,
      message: 'Foto agregada a galería',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding to galeria:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar foto de galería
router.delete('/galeria/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE galeria SET activo = FALSE WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }
    
    res.json({ success: true, message: 'Foto eliminada' });
  } catch (error) {
    console.error('Error deleting from galeria:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Galería combinada: base de datos + locales
router.get('/galeria/local', async (req, res) => {
  // Obtener fotos de la base de datos
  let fotosDB = [];
  try {
    const result = await pool.query(
      'SELECT categoria, titulo as nombre, imagen_url as url FROM galeria WHERE activo = TRUE ORDER BY categoria, titulo'
    );
    fotosDB = result.rows;
  } catch(e) {
    console.log('No hay fotos en BD');
  }
  
  // Agrupar fotos de BD por categoría
  const categoriasDB = {};
  fotosDB.forEach(f => {
    if (!categoriasDB[f.categoria]) {
      categoriasDB[f.categoria] = {
        categoria: f.categoria,
        nombre: f.categoria.charAt(0).toUpperCase() + f.categoria.slice(1),
        icon: '📷',
        imagenes: []
      };
    }
    categoriasDB[f.categoria].imagenes.push({
      url: f.imagen_url,
      nombre: f.nombre
    });
  });
  
  // Fotos locales hardcodeadas
  const galeriaLocal = [
    {
      categoria: 'perfilado',
      nombre: 'Perfilado',
      icon: '✂️',
      imagenes: [
        { url: '/fotos/perfilado/IMG-20260325-WA0019.jpg', nombre: 'IMG-20260325-WA0019.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0021.jpg', nombre: 'IMG-20260325-WA0021.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0034.jpg', nombre: 'IMG-20260325-WA0034.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0038.jpg', nombre: 'IMG-20260325-WA0038.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0039.jpg', nombre: 'IMG-20260325-WA0039.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0046.jpg', nombre: 'IMG-20260325-WA0046.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0059.jpg', nombre: 'IMG-20260325-WA0059.jpg' },
        { url: '/fotos/perfilado/IMG-20260325-WA0063.jpg', nombre: 'IMG-20260325-WA0063.jpg' }
      ]
    },
    {
      categoria: 'alisados y tratamientos',
      nombre: 'Alisados y Tratamientos',
      icon: '💇‍♀️',
      imagenes: [
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0028.jpg', nombre: 'IMG-20260325-WA0028.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0032.jpg', nombre: 'IMG-20260325-WA0032.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0035.jpg', nombre: 'IMG-20260325-WA0035.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0042.jpg', nombre: 'IMG-20260325-WA0042.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0050.jpg', nombre: 'IMG-20260325-WA0050.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0051.jpg', nombre: 'IMG-20260325-WA0051.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0052.jpg', nombre: 'IMG-20260325-WA0052.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0056.jpg', nombre: 'IMG-20260325-WA0056.jpg' },
        { url: '/fotos/alisados y tratamientos/IMG-20260325-WA0060.jpg', nombre: 'IMG-20260325-WA0060.jpg' }
      ]
    },
    {
      categoria: 'peinados',
      nombre: 'Peinados',
      icon: '👰',
      imagenes: [
        { url: '/fotos/peinados/IMG-20260325-WA0023.jpg', nombre: 'IMG-20260325-WA0023.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0025.jpg', nombre: 'IMG-20260325-WA0025.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0027.jpg', nombre: 'IMG-20260325-WA0027.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0031.jpg', nombre: 'IMG-20260325-WA0031.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0033.jpg', nombre: 'IMG-20260325-WA0033.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0044.jpg', nombre: 'IMG-20260325-WA0044.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0045.jpg', nombre: 'IMG-20260325-WA0045.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0048.jpg', nombre: 'IMG-20260325-WA0048.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0049.jpg', nombre: 'IMG-20260325-WA0049.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0053.jpg', nombre: 'IMG-20260325-WA0053.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0055.jpg', nombre: 'IMG-20260325-WA0055.jpg' },
        { url: '/fotos/peinados/IMG-20260325-WA0064.jpg', nombre: 'IMG-20260325-WA0064.jpg' }
      ]
    },
    {
      categoria: 'facial',
      nombre: 'Facial',
      icon: '✨',
      imagenes: [
        { url: '/fotos/facial/IMG-20260325-WA0022.jpg', nombre: 'IMG-20260325-WA0022.jpg' },
        { url: '/fotos/facial/IMG-20260325-WA0030.jpg', nombre: 'IMG-20260325-WA0030.jpg' },
        { url: '/fotos/facial/IMG-20260325-WA0040.jpg', nombre: 'IMG-20260325-WA0040.jpg' },
        { url: '/fotos/facial/IMG-20260325-WA0041.jpg', nombre: 'IMG-20260325-WA0041.jpg' }
      ]
    },
    {
      categoria: 'pestañas',
      nombre: 'Pestañas',
      icon: '🌟',
      imagenes: [
        { url: '/fotos/pestañas/IMG-20260325-WA0024.jpg', nombre: 'IMG-20260325-WA0024.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0029.jpg', nombre: 'IMG-20260325-WA0029.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0036.jpg', nombre: 'IMG-20260325-WA0036.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0047.jpg', nombre: 'IMG-20260325-WA0047.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0054.jpg', nombre: 'IMG-20260325-WA0054.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0057.jpg', nombre: 'IMG-20260325-WA0057.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0058.jpg', nombre: 'IMG-20260325-WA0058.jpg' },
        { url: '/fotos/pestañas/IMG-20260325-WA0061.jpg', nombre: 'IMG-20260325-WA0061.jpg' }
      ]
    },
    {
      categoria: 'productos',
      nombre: 'Productos',
      icon: '💄',
      imagenes: [
        { url: '/fotos/productos/IMG-20260325-WA0020.jpg', nombre: 'IMG-20260325-WA0020.jpg' },
        { url: '/fotos/productos/IMG-20260325-WA0026.jpg', nombre: 'IMG-20260325-WA0026.jpg' },
        { url: '/fotos/productos/IMG-20260325-WA0037.jpg', nombre: 'IMG-20260325-WA0037.jpg' }
      ]
    }
  ];
  
  // Combinar fotos de BD con fotos locales
  Object.keys(categoriasDB).forEach(cat => {
    if (!galeriaLocal.find(g => g.categoria === cat)) {
      galeriaLocal.push(categoriasDB[cat]);
    } else {
      // Agregar fotos de BD a categoría existente
      var catLocal = galeriaLocal.find(g => g.categoria === cat);
      categoriasDB[cat].imagenes.forEach(img => {
        catLocal.imagenes.push(img);
      });
    }
  });
  
  res.json(galeriaLocal);
});

// ==================== LEGAJOS ====================

router.get('/legajos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono
      FROM legajos l
      JOIN clientes c ON l.cliente_id = c.id
      WHERE l.activo = TRUE
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo legajos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/legajos/cliente/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const result = await pool.query(`
      SELECT * FROM legajos 
      WHERE cliente_id = $1 AND activo = TRUE 
      ORDER BY created_at DESC
    `, [clienteId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo legajos del cliente:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/legajos', async (req, res) => {
  try {
    const { cliente_id, tratamiento, tipo, fecha, datos } = req.body;
    
    if (!cliente_id || !fecha || !datos) {
      return res.status(400).json({ error: 'Cliente, fecha y datos son requeridos' });
    }

    const result = await pool.query(
      'INSERT INTO legajos (cliente_id, tratamiento, tipo, fecha, datos) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [cliente_id, tratamiento || 'Facial', tipo || 'facial', fecha, datos]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando legajo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/legajos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        l.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.email as cliente_email
      FROM legajos l
      JOIN clientes c ON l.cliente_id = c.id
      WHERE l.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Legajo no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo legajo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/legajos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE legajos SET activo = FALSE WHERE id = $1', [id]);
    res.json({ message: 'Legajo eliminado' });
  } catch (error) {
    console.error('Error eliminando legajo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar imagen de tratamiento
router.patch('/tratamientos/:id/imagen', async (req, res) => {
  try {
    const { id } = req.params;
    const { imagen_url } = req.body;
    
    const result = await pool.query(
      'UPDATE tratamientos SET imagen_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [imagen_url, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tratamiento no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando imagen:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== TESTIMONIOS ====================

// Obtener testimonios aprobados
router.get('/testimonios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.nombre as cliente_nombre
      FROM testimonios t
      JOIN clientes c ON t.cliente_id = c.id
      WHERE t.aprobado = TRUE AND t.activo = TRUE
      ORDER BY t.created_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo testimonios:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear testimonio (cliente)
router.post('/testimonios', async (req, res) => {
  try {
    const { cliente_id, texto, calificacion } = req.body;
    
    if (!texto || texto.trim().length < 10) {
      return res.status(400).json({ error: 'El testimonio debe tener al menos 10 caracteres' });
    }
    
    const result = await pool.query(
      'INSERT INTO testimonios (cliente_id, texto, calificacion) VALUES ($1, $2, $3) RETURNING *',
      [cliente_id, texto.trim(), calificacion || 5]
    );
    
    res.json({ success: true, message: '¡Gracias por tu opinión! Tu testimonio será revisado.', testimonio: result.rows[0] });
  } catch (error) {
    console.error('Error creando testimonio:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener todos los testimonios (admin)
router.get('/testimonios/todos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.nombre as cliente_nombre
      FROM testimonios t
      JOIN clientes c ON t.cliente_id = c.id
      WHERE t.activo = TRUE
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo testimonios:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Aprobar/rechazar testimonio (admin)
router.patch('/testimonios/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { aprobado } = req.body;
    
    const result = await pool.query(
      'UPDATE testimonios SET aprobado = $1 WHERE id = $2 RETURNING *',
      [aprobado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonio no encontrado' });
    }
    
    res.json({ success: true, testimonio: result.rows[0] });
  } catch (error) {
    console.error('Error aprobando testimonio:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar testimonio (admin)
router.delete('/testimonios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE testimonios SET activo = FALSE WHERE id = $1', [id]);
    res.json({ success: true, message: 'Testimonio eliminado' });
  } catch (error) {
    console.error('Error eliminando testimonio:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ==================== HORARIOS BLOQUEADOS ====================

// Obtener horarios bloqueados
router.get('/horarios-bloqueados', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM horarios_bloqueados WHERE activo = TRUE ORDER BY fecha, hora'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo horarios bloqueados:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Bloquear horario
router.post('/horarios-bloqueados', async (req, res) => {
  try {
    const { fecha, hora, motivo } = req.body;
    
    if (!fecha) {
      return res.status(400).json({ error: 'Fecha es requerida' });
    }
    
    const result = await pool.query(
      'INSERT INTO horarios_bloqueados (fecha, hora, motivo) VALUES ($1, $2, $3) RETURNING *',
      [fecha, hora || null, motivo || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error bloqueando horario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Desbloquear horario
router.delete('/horarios-bloqueados/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE horarios_bloqueados SET activo = FALSE WHERE id = $1',
      [id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error desbloqueando:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Verificar si un horario está bloqueado
router.get('/horario-bloqueado/:fecha/:hora', async (req, res) => {
  try {
    const { fecha, hora } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM horarios_bloqueados WHERE fecha = $1 AND hora = $2 AND activo = TRUE',
      [fecha, hora]
    );
    
    res.json({ bloqueado: result.rows.length > 0, data: result.rows[0] });
  } catch (error) {
    res.json({ bloqueado: false });
  }
});

// ==================== ENCUESTAS HAIRSTYLE ====================

async function encuestaOpciones(encuestaId) {
  const res = await pool.query(
    'SELECT * FROM encuesta_opciones WHERE encuesta_id = $1 ORDER BY posicion, id',
    [encuestaId]
  );
  return res.rows;
}

async function encuestaResultados(encuestaId) {
  const res = await pool.query(
    'SELECT opcion_id, COUNT(*)::int AS votos FROM encuesta_votos WHERE encuesta_id = $1 GROUP BY opcion_id',
    [encuestaId]
  );
  const total = await pool.query('SELECT COUNT(*)::int AS total FROM encuesta_votos WHERE encuesta_id = $1', [encuestaId]);
  return { por_opcion: res.rows, total: parseInt(total.rows[0].total || 0) };
}

// Encuestas activas para clientas (con deteccion de si ya voto)
router.get('/encuestas', async (req, res) => {
  try {
    const clienteId = parseInt(req.query.cliente_id) || null;
    const encuestasRes = await pool.query(
      'SELECT * FROM encuestas WHERE activo = TRUE ORDER BY created_at DESC'
    );
    const resultado = [];
    for (const encuesta of encuestasRes.rows) {
      const opciones = await encuestaOpciones(encuesta.id);
      const resultados = await encuestaResultados(encuesta.id);

      let opcionElegida = null;
      if (clienteId) {
        const voto = await pool.query(
          'SELECT opcion_id FROM encuesta_votos WHERE encuesta_id = $1 AND cliente_id = $2',
          [encuesta.id, clienteId]
        );
        opcionElegida = voto.rows.length > 0 ? voto.rows[0].opcion_id : null;
      }

      const opcionesFinales = opciones.map(function(op) {
        const v = resultados.por_opcion.find(function(r) { return r.opcion_id === op.id; });
        return {
          id: op.id,
          texto: op.texto,
          votos: opcionElegida !== null ? (v ? v.votos : 0) : null,
          elegida: op.id === opcionElegida
        };
      });

      resultado.push({
        id: encuesta.id,
        pregunta: encuesta.pregunta,
        activo: encuesta.activo,
        created_at: encuesta.created_at,
        ya_voto: opcionElegida !== null,
        opcion_elegida: opcionElegida,
        total_votos: opcionElegida !== null ? resultados.total : null,
        opciones: opcionesFinales
      });
    }
    res.json(resultado);
  } catch (error) {
    console.error('Error obteniendo encuestas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Votar una encuesta (una vez por clienta)
router.post('/encuestas/:id/votar', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteId = parseInt(req.body.cliente_id);
    const opcionId = parseInt(req.body.opcion_id);

    if (!clienteId) return res.status(400).json({ error: 'cliente_id es requerido' });
    if (!opcionId) return res.status(400).json({ error: 'opcion_id es requerido' });

    const encuesta = await pool.query(
      'SELECT * FROM encuestas WHERE id = $1 AND activo = TRUE',
      [id]
    );
    if (encuesta.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada o inactiva' });
    }

    const opcionValida = await pool.query(
      'SELECT id FROM encuesta_opciones WHERE id = $1 AND encuesta_id = $2',
      [opcionId, id]
    );
    if (opcionValida.rows.length === 0) {
      return res.status(400).json({ error: 'Opción inválida para esta encuesta' });
    }

    const yaVoto = await pool.query(
      'SELECT id FROM encuesta_votos WHERE encuesta_id = $1 AND cliente_id = $2',
      [id, clienteId]
    );
    if (yaVoto.rows.length > 0) {
      return res.status(400).json({ error: 'Ya participaste en esta encuesta' });
    }

    await pool.query(
      'INSERT INTO encuesta_votos (encuesta_id, opcion_id, cliente_id) VALUES ($1, $2, $3)',
      [id, opcionId, clienteId]
    );

    const opciones = await encuestaOpciones(id);
    const resultados = await encuestaResultados(id);
    const opcionesFinales = opciones.map(function(op) {
      const v = resultados.por_opcion.find(function(r) { return r.opcion_id === op.id; });
      return { id: op.id, texto: op.texto, votos: v ? v.votos : 0, elegida: op.id === opcionId };
    });

    res.json({ success: true, ya_voto: true, opcion_elegida: opcionId, total_votos: resultados.total, opciones: opcionesFinales });
  } catch (error) {
    console.error('Error votando encuesta:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Todas las encuestas para el panel admin (activ, inactivas e historial)
router.get('/encuestas/admin', async (req, res) => {
  try {
    const encuestasRes = await pool.query(
      'SELECT * FROM encuestas ORDER BY created_at DESC'
    );
    const votosRes = await pool.query(`
      SELECT v.encuesta_id, v.opcion_id, v.cliente_id, c.nombre AS cliente_nombre
      FROM encuesta_votos v
      JOIN clientes c ON c.id = v.cliente_id
    `);
    const resultado = [];
    for (const encuesta of encuestasRes.rows) {
      const opciones = await encuestaOpciones(encuesta.id);
      const resultados = await encuestaResultados(encuesta.id);
      const votosEncuesta = votosRes.rows.filter(function(v) { return v.encuesta_id === encuesta.id; });
      const votantes = votosEncuesta.map(function(v) {
        return { cliente_id: v.cliente_id, nombre: v.cliente_nombre };
      });
      resultado.push({
        id: encuesta.id,
        pregunta: encuesta.pregunta,
        activo: encuesta.activo,
        created_at: encuesta.created_at,
        total_votos: resultados.total,
        votantes: votantes,
        opciones: opciones.map(function(op) {
          const v = resultados.por_opcion.find(function(r) { return r.opcion_id === op.id; });
          return {
            id: op.id,
            texto: op.texto,
            votos: v ? v.votos : 0,
            votantes: votosEncuesta.filter(function(v2) { return v2.opcion_id === op.id; }).map(function(v2) {
              return { cliente_id: v2.cliente_id, nombre: v2.cliente_nombre };
            })
          };
        })
      });
    }
    res.json(resultado);
  } catch (error) {
    console.error('Error obteniendo encuestas admin:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear encuesta (2 a 5 opciones)
router.post('/encuestas', async (req, res) => {
  try {
    const { pregunta, opciones } = req.body;
    const textoPregunta = (pregunta || '').trim();
    if (!textoPregunta) return res.status(400).json({ error: 'La pregunta es requerida' });

    if (!Array.isArray(opciones) || opciones.length < 2 || opciones.length > 5) {
      return res.status(400).json({ error: 'Se requieren entre 2 y 5 opciones' });
    }
    const textos = opciones.map(function(o) { return (typeof o === 'string' ? o : o.texto || '').trim(); });
    if (textos.some(function(t) { return t === ''; })) {
      return res.status(400).json({ error: 'Todas las opciones deben tener texto' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const enc = await client.query(
        'INSERT INTO encuestas (pregunta, activo) VALUES ($1, TRUE) RETURNING *',
        [textoPregunta]
      );
      const encuestaId = enc.rows[0].id;
      for (let i = 0; i < textos.length; i++) {
        await client.query(
          'INSERT INTO encuesta_opciones (encuesta_id, texto, posicion) VALUES ($1, $2, $3)',
          [encuestaId, textos[i], i]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ id: encuestaId, pregunta: textoPregunta, activo: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creando encuesta:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Editar encuesta (solo si aun no tiene votos)
router.put('/encuestas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pregunta, opciones } = req.body;
    const textoPregunta = (pregunta || '').trim();
    if (!textoPregunta) return res.status(400).json({ error: 'La pregunta es requerida' });

    if (!Array.isArray(opciones) || opciones.length < 2 || opciones.length > 5) {
      return res.status(400).json({ error: 'Se requieren entre 2 y 5 opciones' });
    }
    const textos = opciones.map(function(o) { return (typeof o === 'string' ? o : o.texto || '').trim(); });
    if (textos.some(function(t) { return t === ''; })) {
      return res.status(400).json({ error: 'Todas las opciones deben tener texto' });
    }

    const votos = await pool.query('SELECT COUNT(*)::int AS total FROM encuesta_votos WHERE encuesta_id = $1', [id]);
    if (parseInt(votos.rows[0].total || 0) > 0) {
      return res.status(400).json({ error: 'No se puede editar: la encuesta ya tiene votos' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        'UPDATE encuestas SET pregunta = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [textoPregunta, id]
      );
      if (updated.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Encuesta no encontrada' });
      }
      await client.query('DELETE FROM encuesta_opciones WHERE encuesta_id = $1', [id]);
      for (let i = 0; i < textos.length; i++) {
        await client.query(
          'INSERT INTO encuesta_opciones (encuesta_id, texto, posicion) VALUES ($1, $2, $3)',
          [id, textos[i], i]
        );
      }
      await client.query('COMMIT');
      res.json({ success: true, id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error editando encuesta:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Activar / desactivar encuesta
router.patch('/encuestas/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const activo = !!req.body.activo;
    const result = await pool.query(
      'UPDATE encuestas SET activo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [activo, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }
    res.json({ success: true, activo });
  } catch (error) {
    console.error('Error activando encuesta:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar encuesta (sus opciones y votos caen en cascada)
router.delete('/encuestas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM encuestas WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando encuesta:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;