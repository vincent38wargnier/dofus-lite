import { compileBot } from '../bots/compile';
import { opponentFighterId, opponentSummary, opponentTeamErrors } from '../engine/opponentTeam';
import { findBot } from './botsStore';

export function compileOpponentBots(opponents, allBots, defaultBotId = 'maison', encounter) {
  const errors = opponentTeamErrors(opponents, encounter);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.fromEntries(opponents.flatMap((entry, index) => {
    // An unconfigured monster keeps the native monster AI. Characters from
    // legacy configurations inherit their former shared selection.
    if (entry.kind === 'monster' && !entry.botId) return [];
    const name = opponentSummary(entry).name;
    const bot = findBot(allBots, entry.botId || defaultBotId);
    if (!bot) throw new Error(`${name} : choisissez une IA disponible pour cet adversaire.`);
    // Never share a compiled closure, even for two copies of the same profile.
    try { return [[opponentFighterId(index), { name: bot.name, decide: compileBot(bot.code) }]]; }
    catch (error) { throw new Error(`${name} · ${bot.name} : ${error.message}`); }
  }));
}
