// Las mismas reglas que backend/src/utils/validacion.js, para avisar antes de mandar el
// formulario. Quien decide es el backend: si cambia una regla allá, hay que cambiarla acá.
//
// No prueban que el documento exista ni que sea de quien lo carga, solo descartan los
// errores de tipeo y los números inventados.

// 20, 23, 24, 25, 26 y 27 son personas; 30, 33 y 34, empresas
const PREFIJOS_CUIT = ['20', '23', '24', '25', '26', '27', '30', '33', '34']
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

// CUIT o CUIL: 11 dígitos, un prefijo que exista y el dígito verificador (módulo 11)
export function esCuitValido(valor) {
  if (!/^\d{11}$/.test(valor) || !PREFIJOS_CUIT.includes(valor.slice(0, 2))) {
    return false
  }

  const suma = PESOS_CUIT.reduce((total, peso, posicion) => total + peso * Number(valor[posicion]), 0)
  const resto = suma % 11

  // Con resto 1 el verificador sería 10, que no entra en un dígito: ese número no existe
  if (resto === 1) {
    return false
  }

  return (resto === 0 ? 0 : 11 - resto) === Number(valor[10])
}

// DNI: 7 u 8 dígitos (los menores a 10 millones tienen 7), sin ceros adelante
export const esDniValido = (valor) => /^[1-9]\d{6,7}$/.test(valor)
