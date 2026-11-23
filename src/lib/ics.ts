// Lembretes no celular: gera um arquivo .ics (calendário) só com os itens críticos.
// O celular importa uma vez e o alarme toca mesmo offline e com o app fechado.
// Cada horário é convertido para instante absoluto usando o fuso do item.
import type { Roteiro } from '../types';
import { fusoDoItem } from './game';
import { zonedToEpoch } from './time';

const LEMBRETE_PADRAO = 30;

function utc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function texto(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Quebra linhas longas (regra do formato .ics: até 75 bytes por linha). */
function dobrar(linha: string): string {
  const out: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) {
      out.push(atual);
      atual = ' ';
      bytes = 1;
    }
    atual += ch;
    bytes += b;
  }
  out.push(atual);
  return out.join('\r\n');
}

export function itensComLembrete(roteiro: Roteiro) {
  return roteiro.itens.filter((i) => i.critico && i.hora_inicio);
}

export function gerarIcs(roteiro: Roteiro, agoraMs = Date.now()): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Japao em Familia//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${texto(roteiro.viagem.nome_viagem)}`,
  ];
  for (const it of itensComLembrete(roteiro)) {
    const tz = fusoDoItem(it, roteiro);
    const inicio = zonedToEpoch(it.data, it.hora_inicio!, tz);
    let fim = it.hora_fim ? zonedToEpoch(it.data, it.hora_fim, tz) : inicio + 30 * 60000;
    if (fim <= inicio) fim += 86400000;
    const min = it.lembrete_min ?? LEMBRETE_PADRAO;
    const descricao = [it.descricao, it.notas, it.endereco_jp].filter(Boolean).join('\n');
    linhas.push(
      'BEGIN:VEVENT',
      // A coluna id é a chave estável: reimportar atualiza o mesmo evento.
      `UID:${it.id}@japao-em-familia`,
      `DTSTAMP:${utc(agoraMs)}`,
      `DTSTART:${utc(inicio)}`,
      `DTEND:${utc(fim)}`,
      `SUMMARY:${texto(`⚠️ ${it.titulo}`)}`,
    );
    if (it.local) linhas.push(`LOCATION:${texto(it.local)}`);
    if (descricao) linhas.push(`DESCRIPTION:${texto(descricao)}`);
    linhas.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${texto(`Em ${min} min: ${it.titulo}`)}`,
      `TRIGGER:-PT${min}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

export function baixarIcs(roteiro: Roteiro) {
  const blob = new Blob([gerarIcs(roteiro)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lembretes-japao.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
