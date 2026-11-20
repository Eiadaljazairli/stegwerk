import { type Aufgabe, loese } from './arbeitsnachweis';

self.onmessage = (ereignis: MessageEvent<Aufgabe>) => {
  void loese(ereignis.data).then((zahl) => self.postMessage(zahl));
};
