import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import Registro from './pages/Registro/Registro'
import Comercios from './pages/Comercios/Comercios'
import Comercio from './pages/Comercio/Comercio'
import Carrito from './pages/Carrito/Carrito'
import Checkout from './pages/Checkout/Checkout'
import Pedidos from './pages/Pedidos/Pedidos'

export default function App() {
    const ruta = window.location.pathname

    if (ruta === '/login') {
        return <Login />
    }

    if (ruta === '/registro') {
        return <Registro />
    }

    if (ruta === '/comercios') {
        return <Comercios />
    }

    if (ruta === '/comercio') {
        return <Comercio />
    }

    if (ruta === '/carrito') {
        return <Carrito />
    }

    if (ruta === '/checkout') {
        return <Checkout />
    }

    if (ruta === '/pedidos') {
        return <Pedidos />
    }

    return <Landing />
}