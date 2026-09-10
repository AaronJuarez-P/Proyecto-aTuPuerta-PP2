import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import Registro from './pages/Registro/Registro'
import Comercios from './pages/Comercios/Comercios'
import Comercio from './pages/Comercio/Comercio'
import Carrito from './pages/Carrito/Carrito'
import Checkout from './pages/Checkout/Checkout'
import Pedidos from './pages/Pedidos/Pedidos'
import Perfil from './pages/Perfil/Perfil'
import Pedido from './pages/Pedido/Pedido'
import ComercioAdmin from './pages/ComercioAdmin/ComercioAdmin'

export default function App() {
  const ruta = window.location.pathname

  if (ruta === '/login') return <Login />
  if (ruta === '/registro') return <Registro />
  if (ruta === '/comercios') return <Comercios />
  if (ruta === '/comercio') return <Comercio />
  if (ruta === '/carrito') return <Carrito />
  if (ruta === '/checkout') return <Checkout />
  if (ruta === '/pedidos') return <Pedidos />
  if (ruta === '/perfil') return <Perfil />
  if (ruta === '/pedido') return <Pedido />
  if (ruta === '/comercio-admin') return <ComercioAdmin />
  
  return <Landing />
}