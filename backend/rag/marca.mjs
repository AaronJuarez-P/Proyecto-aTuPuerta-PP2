// La marca de TU corpus: una expresión regular que reconoce
// el párrafo donde empieza cada parte (como "Artículo N." en el reglamento).
// Si tu corpus no tiene ninguna estructura clara, poné null: se trocea fijo.

// El Centro de ayuda de ATuPuerta: cada parte arranca con un título "## ¿…?" en un
// renglón propio. El .+ toma el renglón entero, así la sección que se cita como fuente
// es la pregunta completa y no solo "##".
export const MARCA = /^## .+/;
