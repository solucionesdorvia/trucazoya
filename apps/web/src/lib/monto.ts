/**
 * Normaliza lo que se tipea en un campo de fichas.
 *
 * El campo tiene que poder quedar VACÍO mientras se escribe. Cuando guardaba un
 * número, borrar todo dejaba un `0` fijo adelante que no había forma de sacar
 * (se tipeaba encima y quedaba "02500"). Por eso el estado es texto y esta
 * función sólo saca lo que no corresponde.
 */
export function limpiarMonto(texto: string): string {
  return texto
    .replace(/\D/g, '') // sólo dígitos: nada de "-", ",", "e" ni letras
    .replace(/^0+(?=\d)/, ''); // sin ceros a la izquierda, pero "" y "0" quedan
}
