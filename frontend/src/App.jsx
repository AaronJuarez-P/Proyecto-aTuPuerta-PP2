import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import SesionProvider from './context/SesionProvider'
import AvisosProvider from './context/AvisosProvider'
import CarritoProvider from './context/CarritoProvider'
import Layout from './components/Layout'
import RutaProtegida from './components/RutaProtegida'
import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import Registro from './pages/Registro/Registro'
import RegistroComercio from './pages/RegistroComercio/RegistroComercio'
import RegistroRepartidor from './pages/RegistroRepartidor/RegistroRepartidor'
import Comercios from './pages/Comercios/Comercios'
import Comercio from './pages/Comercio/Comercio'
import Carrito from './pages/Carrito/Carrito'
import Checkout from './pages/Checkout/Checkout'
import Pedidos from './pages/Pedidos/Pedidos'
import Perfil from './pages/Perfil/Perfil'
import ComercioAdmin from './pages/ComercioAdmin/ComercioAdmin'
import ComercioVenta from './pages/ComercioVenta/ComercioVenta'
import ComercioProductos from './pages/ComercioProductos/ComercioProductos'
import RepartidorAdmin from './pages/RepartidorAdmin/RepartidorAdmin'
import Admin from './pages/Admin/Admin'
import NoEncontrado from './pages/NoEncontrado/NoEncontrado'

// Las pantallas con mapa y socket (Leaflet y Socket.IO pesan) se bajan recién cuando se
// abren: el resto de la app no las necesita. Layout pone el Suspense.
const Pedido = lazy(() => import('./pages/Pedido/Pedido'))

// Las notificaciones push del backend traen URLs propias (/cliente/pedidos/5,
// /repartidor/pedidos...). Estas rutas las llevan a la pantalla que corresponde.
function Redirigir({ a }) {
  const parametros = useParams()
  return <Navigate to={a.replace(/:(\w+)/g, (_, clave) => parametros[clave])} replace />
}

// El carrito depende de la sesión (es el del cliente logueado) y los avisos los usan todos
function Proveedores({ children }) {
  return (
    <SesionProvider>
      <AvisosProvider>
        <CarritoProvider>{children}</CarritoProvider>
      </AvisosProvider>
    </SesionProvider>
  )
}

export default function App() {
  // useTransitions={false}: por defecto React Router aplica los cambios de ruta como
  // transiciones, con menos prioridad que el resto de los estados. Al cerrar sesión en una
  // ruta protegida, la sesión vacía llegaba antes que la navegación al inicio y la ruta
  // protegida alcanzaba a mandar al login. Así la ruta y la sesión cambian en el mismo render.
  return (
    <BrowserRouter useTransitions={false}>
      <Proveedores>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="registro" element={<Registro />} />
            <Route path="registro/comercio" element={<RegistroComercio />} />
            <Route path="registro/repartidor" element={<RegistroRepartidor />} />
            <Route path="comercios" element={<Comercios />} />
            <Route path="comercios/:id" element={<Comercio />} />

            <Route element={<RutaProtegida roles={['cliente']} />}>
              <Route path="carrito" element={<Carrito />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/:id" element={<Pedido />} />
              <Route path="cliente/pedidos/:id" element={<Redirigir a="/pedidos/:id" />} />
            </Route>

            <Route element={<RutaProtegida />}>
              <Route path="perfil" element={<Perfil />} />
            </Route>

            <Route element={<RutaProtegida roles={['comercio']} />}>
              <Route path="comercio" element={<ComercioAdmin />} />
              <Route path="comercio/ventas/:id" element={<ComercioVenta />} />
              <Route path="comercio/pedidos/:id" element={<Redirigir a="/comercio/ventas/:id" />} />
              <Route path="comercio/productos" element={<ComercioProductos />} />
            </Route>

            <Route element={<RutaProtegida roles={['repartidor']} />}>
              <Route path="repartidor" element={<RepartidorAdmin />} />
              <Route path="repartidor/pedidos" element={<Navigate to="/repartidor" replace />} />
              <Route path="repartidor/pedidos-disponibles" element={<Navigate to="/repartidor" replace />} />
            </Route>

            <Route element={<RutaProtegida roles={['administrador']} />}>
              <Route path="admin" element={<Admin />} />
            </Route>

            <Route path="*" element={<NoEncontrado />} />
          </Route>
        </Routes>
      </Proveedores>
    </BrowserRouter>
  )
}
