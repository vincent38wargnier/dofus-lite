import { compileBot } from '../bots/compile';
import { findBot } from './botsStore';
import { allyFighterId, teamFighterId, allyTeamErrors } from '../engine/allyTeam';

export function compileCompleteTeamBots(team, allBots) {
  const errors = allyTeamErrors(team, false);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.fromEntries(team.flatMap((entry, index) => {
    if (entry.kind === 'monster' || entry.controller !== 'ai') return [];
    const bot = findBot(allBots, entry.botId || 'maison');
    if (!bot) throw new Error(`${entry.name} : choisissez une IA disponible pour cet allié.`);
    try { return [[teamFighterId(index), { name: bot.name, decide: compileBot(bot.code) }]]; }
    catch (error) { throw new Error(`${entry.name} · ${bot.name} : ${error.message}`); }
  }));
}

export function compileTeamBots(controller, playerBotId, allies, allBots) {
  const compiled = compileAllyBots(allies, allBots);
  if (controller !== 'ai') return compiled;
  const bot = findBot(allBots, playerBotId);
  if (!bot) throw new Error('Choisissez une IA disponible pour votre personnage principal.');
  try { compiled.A = { name: bot.name, decide: compileBot(bot.code) }; }
  catch (error) { throw new Error(`Personnage principal · ${bot.name} : ${error.message}`); }
  return compiled;
}

export function compileAllyBots(allies, allBots, automatic = false) {
  const errors = allyTeamErrors(allies);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.fromEntries(allies.flatMap((entry, index) => {
    if (entry.kind === 'monster' || (!automatic && entry.controller !== 'ai')) return [];
    const bot = findBot(allBots, entry.botId || 'maison');
    if (!bot) throw new Error(`${entry.name} : choisissez une IA disponible pour cet allié.`);
    // Compile separately even when two allies share the same selected AI.
    try { return [[allyFighterId(index), { name: bot.name, decide: compileBot(bot.code) }]]; }
    catch (error) { throw new Error(`${entry.name} · ${bot.name} : ${error.message}`); }
  }));
}
