import { useCallback, useState } from 'react'
import {
  actualizarPrecio,
  actualizarStock,
  crearProducto,
  darDeBajaProducto,
  editarProducto,
  listarMisProductos,
  obtenerAuditoriaProducto,
} from '../../api/comercio'
import { Cargando, EstadoVacio, MensajeError, Modal, Paginacion } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useCarga } from '../../hooks/useCarga'
import { iconoDeCategoria } from '../../utils/categorias'
import { formatearFecha, formatearPrecio } from '../../utils/formato'
import './ComercioProductos.css'

const FILTROS_ESTADO = [
  { valor: 'true', texto: 'A la venta' },
  { valor: 'false', texto: 'Dados de baja' },
  { valor: '', texto: 'Todos' },
]

const ACCIONES_AUDITORIA = { INSERT: 'Alta', UPDATE: 'Cambio', DELETE: 'Baja' }

// PUT /productos/:id es una edición completa: lleva todos los campos
const datosCompletos = (producto, cambios = {}) => ({
  nombre: producto.nombre,
  descripcion: producto.descripcion ?? '',
  categoria: producto.categoria,
  precio: Number(producto.precio),
  stock: Number(producto.stock),
  activo: producto.activo,
  ...cambios,
})

// Gestión del catálogo propio (CU13 a CU16)
export default function ComercioProductos() {
  const avisar = useAvisos()
  const [filtros, setFiltros] = useState({ buscar: '', categoria: '', activo: 'true' })
  const [pagina, setPagina] = useState(1)
  const [modal, setModal] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  const { datos, cargando, error, recargar } = useCarga(
    () => listarMisProductos({ ...filtros, pagina, limite: 20 }),
    [filtros.buscar, filtros.categoria, filtros.activo, pagina]
  )

  const cerrarModal = useCallback(() => setModal(null), [])

  function cambiarFiltro(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }))
    setPagina(1)
  }

  async function ejecutar(producto, accion, mensaje) {
    setOcupado(producto.id)

    try {
      await accion()
      if (mensaje) {
        avisar(mensaje)
      }
      recargar()
    } catch (errorAccion) {
      avisar(errorAccion.message, 'error')
    } finally {
      setOcupado(null)
    }
  }

  const ajustarStock = (producto, ajuste) => ejecutar(producto, () => actualizarStock(producto.id, { ajuste }))

  const fijarStock = (producto, stock) =>
    ejecutar(producto, () => actualizarStock(producto.id, { stock }), `Stock de ${producto.nombre}: ${stock}.`)

  const cambiarPrecio = (producto, precio) =>
    ejecutar(producto, () => actualizarPrecio(producto.id, precio), `Nuevo precio de ${producto.nombre}: ${formatearPrecio(precio)}.`)

  const reactivar = (producto) =>
    ejecutar(producto, () => editarProducto(producto.id, datosCompletos(producto, { activo: true })), `${producto.nombre} vuelve a estar a la venta.`)

  async function darDeBaja(producto) {
    await ejecutar(producto, () => darDeBajaProducto(producto.id), `${producto.nombre} ya no está a la venta.`)
    setModal(null)
  }

  const productos = datos?.productos ?? []
  const categorias = datos?.categorias ?? []

  return (
    <main className="pagina productos-comercio">
      <div className="pagina-contenido">
        <div className="pagina-encabezado">
          <div>
            <p className="etiqueta-seccion">Mi catálogo</p>
            <h1>Productos</h1>
            <p>Cargá tus productos y mantené al día el stock y los precios.</p>
          </div>

          <button type="button" className="boton boton-primario" onClick={() => setModal({ tipo: 'producto' })}>
            + Nuevo producto
          </button>
        </div>

        <div className="barra-filtros">
          <form
            className="campo-form buscador-productos"
            onSubmit={(evento) => {
              evento.preventDefault()
              cambiarFiltro('buscar', String(new FormData(evento.currentTarget).get('buscar') ?? '').trim())
            }}
          >
            <label htmlFor="buscar-producto">Buscar</label>
            <div>
              <input id="buscar-producto" name="buscar" type="search" defaultValue={filtros.buscar} placeholder="Nombre o descripción" />
              <button type="submit" className="boton boton-secundario">Buscar</button>
            </div>
          </form>

          <div className="campo-form">
            <label htmlFor="filtro-categoria">Categoría</label>
            <select id="filtro-categoria" value={filtros.categoria} onChange={(evento) => cambiarFiltro('categoria', evento.target.value)}>
              <option value="">Todas</option>
              {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Estado">
          {FILTROS_ESTADO.map(({ valor, texto }) => (
            <button
              key={texto}
              type="button"
              className={`chip ${filtros.activo === valor ? 'activo' : ''}`}
              onClick={() => cambiarFiltro('activo', valor)}
            >
              {texto}
            </button>
          ))}
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando texto="Cargando tus productos…" />
        ) : productos.length === 0 && !error ? (
          <EstadoVacio
            icono="📦"
            titulo={filtros.buscar || filtros.categoria || filtros.activo !== 'true' ? 'No hay productos con estos filtros' : 'Todavía no cargaste productos'}
            accion={
              <button type="button" className="boton boton-primario" onClick={() => setModal({ tipo: 'producto' })}>
                + Cargar un producto
              </button>
            }
          >
            Los productos que cargues aparecen en la ficha de tu comercio para que los clientes los pidan.
          </EstadoVacio>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-productos">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((producto) => (
                  <tr key={producto.id} className={producto.activo ? '' : 'fila-baja'}>
                    <td>
                      <div className="producto-celda">
                        <span aria-hidden="true">{iconoDeCategoria(producto.categoria, '📦')}</span>
                        <div>
                          <strong>{producto.nombre}</strong>
                          <small>{producto.categoria}{producto.descripcion ? ` · ${producto.descripcion}` : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <CeldaPrecio
                        producto={producto}
                        deshabilitado={ocupado === producto.id || !producto.activo}
                        alGuardar={(precio) => cambiarPrecio(producto, precio)}
                      />
                    </td>
                    <td>
                      <CeldaStock
                        producto={producto}
                        deshabilitado={ocupado === producto.id || !producto.activo}
                        alAjustar={(ajuste) => ajustarStock(producto, ajuste)}
                        alFijar={(stock) => fijarStock(producto, stock)}
                      />
                    </td>
                    <td>
                      <span className={`estado-badge ${producto.activo ? 'tono-ok' : 'tono-neutro'}`}>
                        {producto.activo ? (Number(producto.stock) > 0 ? 'A la venta' : 'Sin stock') : 'Dado de baja'}
                      </span>
                    </td>
                    <td>
                      <div className="acciones-fila">
                        {producto.activo ? (
                          <>
                            <button type="button" className="boton boton-secundario boton-chico" onClick={() => setModal({ tipo: 'producto', producto })}>
                              Editar
                            </button>
                            <button type="button" className="boton boton-peligro boton-chico" onClick={() => setModal({ tipo: 'baja', producto })}>
                              Dar de baja
                            </button>
                          </>
                        ) : (
                          <button type="button" className="boton boton-secundario boton-chico" disabled={ocupado === producto.id} onClick={() => reactivar(producto)}>
                            Volver a vender
                          </button>
                        )}
                        <button type="button" className="boton boton-secundario boton-chico" onClick={() => setModal({ tipo: 'historial', producto })}>
                          Historial
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={setPagina} />
      </div>

      <Modal
        abierto={modal?.tipo === 'producto'}
        titulo={modal?.producto ? `Editar ${modal.producto.nombre}` : 'Nuevo producto'}
        alCerrar={cerrarModal}
      >
        {modal?.tipo === 'producto' && (
          <FormularioProducto
            producto={modal.producto}
            categorias={categorias}
            alGuardar={(producto, esNuevo) => {
              avisar(esNuevo ? `${producto.nombre} ya está a la venta.` : `Guardaste los cambios de ${producto.nombre}.`)
              cerrarModal()
              recargar()
            }}
          />
        )}
      </Modal>

      <Modal abierto={modal?.tipo === 'baja'} titulo={`¿Dar de baja ${modal?.producto?.nombre ?? ''}?`} alCerrar={cerrarModal}>
        <p className="texto-apagado">
          Deja de aparecer en tu comercio y nadie lo puede agregar al carrito. Los pedidos que ya lo
          incluyen no cambian, y lo podés volver a vender cuando quieras.
        </p>
        <div className="acciones">
          <button type="button" className="boton boton-peligro" disabled={ocupado === modal?.producto?.id} onClick={() => darDeBaja(modal.producto)}>
            Sí, dar de baja
          </button>
          <button type="button" className="boton boton-secundario" onClick={cerrarModal}>Cancelar</button>
        </div>
      </Modal>

      <Modal abierto={modal?.tipo === 'historial'} titulo={`Historial de ${modal?.producto?.nombre ?? ''}`} alCerrar={cerrarModal}>
        {modal?.tipo === 'historial' && <HistorialProducto producto={modal.producto} />}
      </Modal>
    </main>
  )
}

function CeldaPrecio({ producto, deshabilitado, alGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(producto.precio))

  if (!editando) {
    return (
      <button
        type="button"
        className="celda-editable"
        disabled={deshabilitado}
        title="Cambiar el precio"
        onClick={() => {
          setValor(String(producto.precio))
          setEditando(true)
        }}
      >
        {formatearPrecio(producto.precio)} <span aria-hidden="true">✎</span>
      </button>
    )
  }

  const numero = Number(valor)
  const valido = valor !== '' && numero > 0

  return (
    <form
      className="celda-edicion"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (valido) {
          alGuardar(numero)
          setEditando(false)
        }
      }}
    >
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        aria-label={`Precio de ${producto.nombre}`}
        autoFocus
      />
      <button type="submit" className="boton boton-primario boton-chico" disabled={!valido}>✓</button>
      <button type="button" className="boton boton-secundario boton-chico" onClick={() => setEditando(false)}>✕</button>
    </form>
  )
}

function CeldaStock({ producto, deshabilitado, alAjustar, alFijar }) {
  const stock = Number(producto.stock)
  const [valor, setValor] = useState(String(stock))
  const [editando, setEditando] = useState(false)

  if (editando) {
    const numero = Number(valor)
    const valido = valor !== '' && Number.isInteger(numero) && numero >= 0

    return (
      <form
        className="celda-edicion"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (valido) {
            alFijar(numero)
            setEditando(false)
          }
        }}
      >
        <input
          type="number"
          min="0"
          step="1"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          aria-label={`Stock de ${producto.nombre}`}
          autoFocus
        />
        <button type="submit" className="boton boton-primario boton-chico" disabled={!valido}>✓</button>
        <button type="button" className="boton boton-secundario boton-chico" onClick={() => setEditando(false)}>✕</button>
      </form>
    )
  }

  return (
    <div className="control-stock">
      <button
        type="button"
        aria-label={`Restar una unidad de ${producto.nombre}`}
        disabled={deshabilitado || stock <= 0}
        onClick={() => alAjustar(-1)}
      >
        −
      </button>
      <button
        type="button"
        className="celda-editable"
        disabled={deshabilitado}
        title="Fijar el stock"
        onClick={() => {
          setValor(String(stock))
          setEditando(true)
        }}
      >
        {stock}
      </button>
      <button
        type="button"
        aria-label={`Sumar una unidad de ${producto.nombre}`}
        disabled={deshabilitado}
        onClick={() => alAjustar(1)}
      >
        +
      </button>
    </div>
  )
}

function FormularioProducto({ producto, categorias, alGuardar }) {
  const [formulario, setFormulario] = useState({
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria: producto?.categoria ?? '',
    precio: producto ? String(producto.precio) : '',
    stock: producto ? String(producto.stock) : '0',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo) => (evento) => setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  async function guardar(evento) {
    evento.preventDefault()
    setError('')

    const datos = {
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim(),
      categoria: formulario.categoria.trim(),
      precio: Number(formulario.precio),
      stock: Number(formulario.stock),
    }

    if (!datos.nombre || !datos.categoria) {
      setError('El nombre y la categoría son obligatorios.')
      return
    }

    if (!(datos.precio > 0)) {
      setError('El precio tiene que ser mayor a 0.')
      return
    }

    if (!Number.isInteger(datos.stock) || datos.stock < 0) {
      setError('El stock tiene que ser un número entero, 0 o más.')
      return
    }

    setGuardando(true)

    try {
      const respuesta = producto
        ? await editarProducto(producto.id, { ...datos, activo: producto.activo })
        : await crearProducto(datos)

      alGuardar(respuesta.producto ?? datos, !producto)
    } catch (errorGuardar) {
      setError(errorGuardar.message)
      setGuardando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <div className="campo-form">
        <label htmlFor="producto-nombre">Nombre</label>
        <input id="producto-nombre" value={formulario.nombre} onChange={cambiar('nombre')} maxLength={100} autoFocus />
      </div>

      <div className="campo-form">
        <label htmlFor="producto-descripcion">Descripción</label>
        <textarea id="producto-descripcion" value={formulario.descripcion} onChange={cambiar('descripcion')} placeholder="Opcional" />
      </div>

      <div className="campo-form">
        <label htmlFor="producto-categoria">Categoría</label>
        <input
          id="producto-categoria"
          list="categorias-producto"
          value={formulario.categoria}
          onChange={cambiar('categoria')}
          maxLength={50}
          placeholder="Elegí una o escribí una nueva"
        />
        <datalist id="categorias-producto">
          {categorias.map((categoria) => <option key={categoria} value={categoria} />)}
        </datalist>
      </div>

      <div className="fila-campos">
        <div className="campo-form">
          <label htmlFor="producto-precio">Precio ($)</label>
          <input id="producto-precio" type="number" min="0.01" step="0.01" value={formulario.precio} onChange={cambiar('precio')} />
        </div>

        <div className="campo-form">
          <label htmlFor="producto-stock">Stock</label>
          <input id="producto-stock" type="number" min="0" step="1" value={formulario.stock} onChange={cambiar('stock')} />
        </div>
      </div>

      {error && <p className="aviso-form aviso-form-error">{error}</p>}

      <div className="acciones">
        <button type="submit" className="boton boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : producto ? 'Guardar cambios' : 'Cargar producto'}
        </button>
      </div>
    </form>
  )
}

function HistorialProducto({ producto }) {
  const { datos, cargando, error, recargar } = useCarga(() => obtenerAuditoriaProducto(producto.id), [producto.id])

  if (cargando && !datos) {
    return <Cargando />
  }

  if (error && !datos) {
    return <MensajeError error={error} alReintentar={recargar} />
  }

  if (datos.auditoria.length === 0) {
    return <p className="texto-apagado">Todavía no hay cambios registrados.</p>
  }

  return (
    <ul className="historial-producto">
      {datos.auditoria.map((registro) => (
        <li key={registro.id}>
          <span className={`estado-badge ${registro.accion === 'DELETE' ? 'tono-error' : registro.accion === 'INSERT' ? 'tono-ok' : 'tono-proceso'}`}>
            {ACCIONES_AUDITORIA[registro.accion] ?? registro.accion}
          </span>
          <span>
            {formatearFecha(registro.fecha, { conHora: false })} {registro.hora?.slice(0, 5)}
          </span>
          <small>{registro.usuario_nombre ?? 'Sistema'}</small>
        </li>
      ))}
    </ul>
  )
}
