// Generic engine strategies, independent of every installed content library.
export const BUILTIN_BOTS = [
  { id: 'maison', name: 'Maison', emoji: '🧠', description: 'Planifie avec les sorts réellement disponibles.', code: 'function decide(view, api) { return api.maison(); }' },
  { id: 'brutus', name: 'Avant-garde', emoji: '⚔️', description: 'Privilégie les dégâts et la cible dangereuse.', code: 'function decide(view, api) { return api.plan({base:"maison",kind:"auto",weights:{damage:1.4}}); }' },
  { id: 'toubib', name: 'Sentinelle', emoji: '🛡️', description: 'Tente un soin utile avant de reprendre l’offensive.', code: 'function decide(view, api) { var heal = api.plan({kind:"heal",base:"maison"}); return heal.type === "PASS" ? api.maison() : heal; }' },
  { id: 'cortex', name: 'Équilibre', emoji: '◇', description: 'Compare les actions sans réglage de classe.', code: 'function decide(view, api) { return api.suggest({}); }' },
  { id: 'stratege', name: 'Stratège', emoji: '♟️', description: 'Explore les suites d’actions avec le simulateur.', code: 'function decide(view, api) { return api.stratege(); }' },
  { id: 'pantin', name: 'Observateur', emoji: '◌', description: 'Passe son tour pour vos essais.', code: 'function decide(view, api) { return api.endTurn(); }' },
].map(bot => ({ ...bot, recommendedClass: null }));
export function getBuiltinBot(id) { return BUILTIN_BOTS.find(bot => bot.id === id) || BUILTIN_BOTS[0]; }
