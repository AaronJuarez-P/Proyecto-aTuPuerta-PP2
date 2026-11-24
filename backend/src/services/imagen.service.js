// Imagenes de comercios y productos: el logo del comercio y la foto de cada producto.
//
// Los archivos se guardan en el disco del backend (IMAGENES_CARPETA, por defecto
// backend/uploads, que no se sube al repo) y la base guarda solo el nombre, en
// comercios.logo y productos.imagen. Se eligio el disco porque la app se presenta en una
// compu, sin internet asegurado: un servicio como Cloudinary dependeria del wifi del
// lugar, y guardarlas en MySQL choca con max_allowed_packet (1 MB en el my.ini de
// XAMPP). Ver "Imagenes" en backend/readme.md.
//
// Este archivo es el unico que sabe donde y con que nombre se guardan. app.js sirve la
// carpeta en /imagenes.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

// Relativa a backend/ o absoluta: las pruebas usan una carpeta aparte
const CARPETA_IMAGENES = path.resolve(__dirname, '..', '..', process.env.IMAGENES_CARPETA || 'uploads');

// Se crea al arrancar: si no existe, el primer guardado fallaria
fs.mkdirSync(CARPETA_IMAGENES, { recursive: true });

// El tipo se reconoce por los primeros bytes del archivo (la firma del formato), no por
// la extension ni por el Content-Type: esos los escribe quien manda el archivo, y un
// .png puede ser cualquier cosa. SVG no esta a proposito: es texto y puede llevar scripts.
const FIRMAS = [
    { extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
    { extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
];

// Devuelve 'jpg' | 'png' | 'webp', o null si no es una imagen que se acepte
const detectarTipoImagen = (buffer) => {
    if (!Buffer.isBuffer(buffer)) {
        return null;
    }

    for (const { extension, bytes } of FIRMAS) {
        if (buffer.length >= bytes.length && bytes.every((byte, indice) => buffer[indice] === byte)) {
            return extension;
        }
    }

    // WebP: "RIFF", cuatro bytes con el largo y "WEBP"
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'webp';
    }

    return null;
};

// Los unicos nombres que arma guardarImagen. borrarImagen no borra ningun otro aunque la
// base diga otra cosa, por ejemplo un valor editado a mano en phpMyAdmin.
const NOMBRE_VALIDO = /^(comercio|producto)-[0-9a-f-]{36}\.(jpg|png|webp)$/;

// archivo: el req.file que deja recibirImagen (multer, en memoria). prefijo: 'comercio' o
// 'producto'. Devuelve el nombre con el que quedo guardado.
//
// El nombre es al azar y nunca se reusa: dos comercios no se pisan el logo.png, un nombre
// como ../../src/app.js no puede escribir fuera de la carpeta, y el navegador puede
// guardar la imagen en cache para siempre, porque cambiar la foto cambia la URL.
const guardarImagen = async (archivo, prefijo) => {
    const extension = detectarTipoImagen(archivo?.buffer);

    if (!extension) {
        const error = new Error("El archivo no es una imagen JPG, PNG o WebP");
        error.codigoHttp = 400;
        throw error;
    }

    const nombre = `${prefijo}-${randomUUID()}.${extension}`;

    // wx: si por algun motivo ya existiera, falla en vez de pisarlo
    await fs.promises.writeFile(path.join(CARPETA_IMAGENES, nombre), archivo.buffer, { flag: 'wx' });

    return nombre;
};

// Borra una imagen que ya no se usa. Nunca tira: se llama despues del commit, cuando la
// fila ya cambio, y un archivo que no se pudo borrar no puede hacer fallar la respuesta.
// Lo peor que pasa es que quede un archivo suelto en la carpeta.
//
// Quien la llama la espera (await) aunque sea despues del commit: es local y rapida, y
// asi, cuando llega la respuesta, la imagen vieja ya no se sirve.
const borrarImagen = async (nombre) => {
    if (typeof nombre !== 'string' || !NOMBRE_VALIDO.test(nombre)) {
        return;
    }

    try {
        await fs.promises.unlink(path.join(CARPETA_IMAGENES, nombre));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`No se pudo borrar la imagen ${nombre}: ${error.message}`);
        }
    }
};

const borrarImagenes = async (nombres = []) => {
    await Promise.all(nombres.map(borrarImagen));
};

module.exports = { CARPETA_IMAGENES, detectarTipoImagen, guardarImagen, borrarImagen, borrarImagenes };
