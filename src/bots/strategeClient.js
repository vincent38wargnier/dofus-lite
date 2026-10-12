// Fabrique du Worker Stratège — ISOLÉE ici car `import.meta.url` (syntaxe
// requise par webpack 5 pour bundler le worker) n'est pas transpilable en
// CommonJS: importer ce fichier côté Node (banc ai_runtime) écrasait tout le
// chargeur. api.js ne l'importe que DYNAMIQUEMENT en navigateur, avec repli
// synchrone si l'import échoue — ce fichier ne doit jamais être importé
// statiquement depuis du code partagé Node/navigateur.
export function createStrategeWorker() {
  return new Worker(new URL('./strategeWorker.js', import.meta.url));
}
