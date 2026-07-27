const express = require('express');
const app = express();
const path = require('path');
const db = require('./db');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS PARA IMÁGENES ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- CONFIGURACIÓN DE MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- CONFIGURACIÓN ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'secreto_super_seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario || null;
    next();
});

// --- MIDDLEWARE DE ADMINISTRADOR ---
const esAdmin = (req, res, next) => {
    if (req.session.usuario && req.session.usuario.rol === 'admin') {
        return next();
    }
    res.status(403).send("Acceso restringido: Solo para el Administrador.");
};

// --- RUTAS GET ---
app.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM productos');
        const mensaje = req.session.mensajeBienvenida || null;
        req.session.mensajeBienvenida = null;
        res.render('index', { productos: result.rows, mensaje: mensaje });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener productos');
    }
});

app.get('/login', (req, res) => res.render('login', { mensaje: null }));
app.get('/registro', (req, res) => res.render('registro'));
app.get('/contacto', (req, res) => res.render('contacto'));
app.get('/autores', (req, res) => res.render('autore'));
app.get('/resumen', (req, res) => res.render('resumen'));
app.get('/articulos', (req, res) => res.render('articulos1'));

// --- RUTA NUEVA: ENVÍO DE MENSAJES CON IMAGEN ---
app.post('/enviar-mensaje', upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, correo, mensaje } = req.body;
        const imagen = req.file ? req.file.filename : null;

        const query = 'INSERT INTO mensajes_contacto (nombre, correo, mensaje, imagen) VALUES ($1, $2, $3, $4)';
        await db.query(query, [nombre, correo, mensaje, imagen]);

        res.status(200).json({ message: 'Enviado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

// --- RUTA NUEVA: PANEL DE MENSAJES PARA ADMIN ---
app.get('/admin/mensajes', esAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM mensajes_contacto ORDER BY fecha DESC');
        res.render('admin_mensajes', { mensajes: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener mensajes');
    }
});

// --- RUTA: HISTORIAL DE COMPRAS ---
app.get('/historial', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');
    try {
        const pedidosRes = await db.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY fecha DESC', [req.session.usuario.id]);
        const pedidos = pedidosRes.rows;
        for (let pedido of pedidos) {
            const prodRes = await db.query('SELECT * FROM detalle_pedidos WHERE pedido_id = $1', [pedido.id]);
            pedido.productos = prodRes.rows;
        }
        res.render('historial', { pedidos: pedidos });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error al cargar el historial");
    }
});

// --- OTRAS RUTAS (API, PEDIDOS, ADMIN) ---
app.get('/api/detalle-pedido/:id', async (req, res) => {
    try {
        const query = 'SELECT * FROM detalle_pedidos WHERE pedido_id = $1';
        const result = await db.query(query, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener el detalle');
    }
});

app.post('/finalizar-compra', async (req, res) => {
    const usuario_id = req.session.usuario ? req.session.usuario.id : null;
    const { total, carrito } = req.body;
    if (!usuario_id) return res.status(401).send({ error: "Debes iniciar sesión para comprar" });
    try {
        const nuevoPedido = await db.query('INSERT INTO pedidos (usuario_id, fecha, total) VALUES ($1, NOW(), $2) RETURNING id', [usuario_id, total]);
        const pedidoId = nuevoPedido.rows[0].id;
        for (let item of carrito) {
            await db.query('INSERT INTO detalle_pedidos (pedido_id, producto_nombre, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)', [pedidoId, item.nombre, item.cantidad, item.precio]);
        }
        res.status(200).send({ mensaje: "Compra realizada con éxito", pedidoId: pedidoId });
    } catch (error) {
        console.error("Error al procesar el pedido:", error);
        res.status(500).send({ error: "Error al procesar el pedido" });
    }
});

app.get('/panel-admin', esAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM usuarios');
        // Capturamos y limpiamos el mensaje de éxito de la sesión si existe
        const mensajeExito = req.session.mensajeExito || null;
        req.session.mensajeExito = null;

        res.render('admin', { usuarios: result.rows, mensajeExito: mensajeExito });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al cargar el panel administrativo');
    }
});

app.get('/api/admin/historial-usuario/:id', esAdmin, async (req, res) => {
    try {
        const pedidosRes = await db.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY fecha DESC', [req.params.id]);
        const pedidos = pedidosRes.rows;
        for (let pedido of pedidos) {
            const prodRes = await db.query('SELECT * FROM detalle_pedidos WHERE pedido_id = $1', [pedido.id]);
            pedido.productos = prodRes.rows;
        }
        res.json(pedidos);
    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).send("Error al cargar el historial");
    }
});

app.post('/admin/agregar-usuario', esAdmin, async (req, res) => {
    const { nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, password, rol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO usuarios (nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, password, rol) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
        await db.query(query, [nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, hashedPassword, rol]);
        
        // Guardamos el mensaje de éxito en la sesión antes de redirigir
        req.session.mensajeExito = 'El usuario fue registrado correctamente.';
        req.session.save(() => {
            res.redirect('/panel-admin');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al agregar usuario: ' + err.message);
    }
});

app.post('/admin/eliminar-usuario/:id', esAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.redirect('/panel-admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al eliminar usuario: ' + err.message);
    }
});

app.post('/registro', async (req, res) => {
    const { nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, password } = req.body;
    try {
        const existe = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) return res.json({ success: false, message: 'El correo ya está registrado.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO usuarios (nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, password, rol) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, \'usuario\')', [nombre, dni, domicilio, fecha_nacimiento, ciudad, provincia, telefono, email, hashedPassword]);
        res.json({ success: true, message: 'Cuenta creada con éxito.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Correo incorrecto' });
        const usuario = result.rows[0];
        const match = await bcrypt.compare(password, usuario.password);
        if (!match) return res.json({ success: false, message: 'Contraseña incorrecta' });
        req.session.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
        req.session.mensajeBienvenida = '¡Bienvenido de nuevo, ' + usuario.nombre + '!';
        req.session.save(() => {
            res.json({ success: true, redirect: usuario.rol === 'admin' ? '/panel-admin' : '/' });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => { res.redirect('/'); });
});

app.listen(3000, () => { console.log('Servidor en http://localhost:3000'); });