import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import Header from './Header/Header'
import Footer from './Footer/Footer'
import { Cargando } from './Comunes/Comunes'

// Header y footer comunes a todas las pantallas menos el login.
//
// Sin recargas entre rutas, el navegador conserva el scroll de la página anterior: acá
// se lleva arriba al cambiar de ruta, o al ancla si el link trae una (/#como-funciona).
export default function Layout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView()
      return
    }

    window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <>
      <Header />
      <Suspense fallback={<main className="pagina"><Cargando /></main>}>
        <Outlet />
      </Suspense>
      <Footer />
    </>
  )
}
