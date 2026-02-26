import * as VuvuzelaNamespace from 'vuvuzela/index.js';

const Vuvuzela = (VuvuzelaNamespace as { default?: unknown }).default ?? VuvuzelaNamespace;

export const parse = (Vuvuzela as { parse?: unknown }).parse;
export const stringify = (Vuvuzela as { stringify?: unknown }).stringify;
export default Vuvuzela;
