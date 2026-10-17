// Original, explicitly fictional forum examples. One line is one message.
// Keep game facts precise; informal spelling is authored, never randomized.
// The website retains the Example badges and fictional-profile disclosures.
const blocks = {
thrones: [
`Vous gardez les 6 héros jusqu'au bout ?
salut, première salle finie avec Jon au sol... il revient bien à la suivante ou j'ai déja foutu ma campagne en l'air ?
Oui il revient, l'équipe récupère entre les salles. Tu peux continuer.
Les archers me posent plus de problèmes que le chef perso. Avec tout le monde au milieu ça pique vite.
Arya sur un coté ça aide. Si tu arrives au contact de l'archer, regarde sa portée mini avant de repartir.
Et Jon dans le feu de Melisandre ça aide moins. Testé pour vous :')
ah mais les zones touchent nos persos aussi ?? ça explique des trucs
Pas toutes. C'est marqué dans la fiche du sort, ouvre le petit i avant de lancer. Sur celui-là oui.
Je vise avec les portraits maintenant. Derrière les barricades je cliquais sur le mauvais perso une fois sur deux.`,
`Arya lâche l'archer à 20 pv pour courir sur le chef
Mon IA traverse la map pour le boss alors qu'il reste un archer quasi mort derrière elle. Vous toucheriez quoi en premier ?
Vérifie déjà qu'elle peut le toucher. Jon devant = ligne de vue bouchée, ça m'a fait chercher une heure pour rien.
+1 pour la ligne de vue, j'avais le même truc dans le couloir.
Si le tir est légal, regarde la priorité aux kills dans le studio. Faut pas qu'un bonus « viser le boss » passe devant tout.
Pas fan du focus boss systématique. Sur cette salle les archers me font plus mal.
Chez moi Arya part sur le côté, Jon au milieu. Ça suffit à éviter le bouchon au premier tour, sans changer l'IA.
Le rapport de décision donne le score du tir aussi. Je regarderais ça avant de bouger tous les curseurs au pif. Chez moi c'était pas la cible le souci : elle gardait des PA pour un deuxième sort, sauf qu'après s'être déplacée elle avait perdu sa ligne de vue. En regardant juste le résultat du tour j'aurais jamais trouvé.`,
`À 3 pour les 6 héros, vous répartissez comment ?
on veut faire la campagne à 3. Deux persos chacun ok, mais j'aimerais éviter de refiler tous les trucs compliqués au même pote
Sépare Arya et Melisandre. Sinon un seul joueur passe son temps à compter les cases pendant que les autres attendent.
Jon + Brienne pour moi, je signe. Je sais avancer tout droit.
Perso je mélangerais un perso devant et un derrière par joueur. Ça évite de jouer deux fois le même tour.
Le plus important c'est d'annoncer où tu finis. « bouge pas je te soigne » puis le mec part à l'autre bout, classique
On fait ça sur vocal, sinon les tours prennent 3 plombes. Surtout pour les zones de feu.
Pas besoin de tout optimiser non plus hein. La première salle sert bien à voir qui comprend ses boutons.`,
`La Néra : c'était NOTRE feu qui tuait Jon
je croyais que les ennemis avaient une attaque cachée. Non. C'était Melisandre. Faut vraiment que je lise les sorts avant de cliquer
Le manteau est noir, pas ignifugé :D
Survole la case avec le sort sélectionné, tu vois la zone avant. Je regarde les bords maintenant, pas seulement la cible.
Petite question du coup, on peut ouvrir le grimoire sans cramer son tour ?
En solo oui ça pause. En multi non, préviens les autres ou lis avant ton tour.
J'avoue le nom des sorts m'a trompé aussi. Je pensais que c'était juste une grosse attaque mono.
Ça me plaît plus qu'un chef avec 50000 pv. Au moins quand je perds je comprend ce que j'ai raté.`],
potter: [
`Les plantes me démontent, c'est normal ?
j'ai couru au milieu des 2 lianes pour taper la mandragore. Plus de PM, plus de vie. Je rate un truc ou faut juste taper plus fort ?
Les racines. Tu peux leur retirer des PM aussi, c'est ton troisième sort.
J'avais zappé ce sort pareil. Le petit chiffre m'avait pas donné envie de le lire...
Garde Concentration pour un tour où tu tapes. Se booster puis passer le bonus à marcher c'est du gachis.
Par la gauche ça passe mieux chez moi. Une liane te rejoint, l'autre perd un tour à venir.
Moi j'aime bien que ça soit court. Tu rates ton placement, tu recommences, pas 20 min de marche avant.`,
`Elle se booste alors qu'il reste une liane à finir
Ma sorcière lance Concentration devant une plante presque morte. Un coup et c'est plié pourtant. On peut mettre une priorité là-dessus ?
Cherche un kill possible avant le boost, déjà.
Attention au « possible ». Si ça tue seulement avec le meilleur jet, c'est pas gagné.
Je laisse Maison décider et je modifie juste la priorité des boosts. Moins prise de tête que de refaire toute l'IA.
Pas forcément d'accord, une petite condition bien placée ça se lit mieux que des poids partout.
Les deux se testent dans le labo. Même départ, mêmes sorts, sinon tu sauras pas ce qui a changé.
J'avais fait une règle qui comptait toujours le jet max... ma mage était très optimiste, pas très vivante.`,
`Envoyer la serre à ma sœur sans lui faire créer un perso
Elle veut jouer, pas remplir 4 onglets de stats. Si je lui envoie le zip elle a directement quelqu'un pour lancer la salle ?
Oui, le perso équipé est fourni. Importer puis jouer l'aventure.
Et zéro compte à créer pour ça, au cas où.
Par contre gardez le zip d'origine si vous bricolez ensuite. C'est facile de changer une valeur et de plus savoir laquelle.
Je fais pareil avec mon frangin. D'abord une salle, l'éditeur après s'il accroche.
Faut juste pas lui vendre tout Poudlard, c'est une petite serre avec trois ennemis pour l'instant.
Trois plantes et j'arrive déja à me faire bloquer, je suis pas pressé pour le château entier ^^`,
`Viser les lianes sur téléphone
quelqu'un joue sur tel ? Quand les plantes sont collées je clique sur la mauvaise, c'est relou
Passe par les portraits pour cibler, t'auras pas le doigt sur les trois à la fois.
Le mode créatures aide aussi, moins de trucs qui se chevauchent.
Je joue avec un peu de zoom. Les boutons grossissent pas donc ça bouffe pas tout l'écran.
Perso portraits pour les attaques mono, carte pour les zones. Ça évite les mauvaises surprises.
Et pour lire, appuie sur le i. Le survol d'une seconde sur téléphone on va attendre longtemps :p
Faudrait un doigt plus petit surtout. J'ai soigné le mauvais perso deux fois avant de voir les portraits.`],
brice: [
`Bon, j'ai perdu contre une serviette
je viens pour une petite partie tranquille, le roi de la serviette me renvoie au menu. Même sur une plage j'arrive à me faire rouler dessus
T'as mis le boost AVANT de taper ?
J'ai fait l'inverse au premier essai aussi. Les boutons jaunes, j'ai cliqué sans lire.
C'est la phrase de fin qui m'a achevé perso
Il manque une salle parasols. Les vrais ennemis de la plage.
Tant qu'on en met pas 30, mon vieux portable a pas demandé à souffrir pour Brice.`,
`Mon Brice passe son temps à frimer et reculer
Il lance le boost, recule, attend. Niveau personnage c'est cohérent mais j'aimerais gagner un combat quand même
Baisse la prudence un peu. Là tu lui demandes de taper fort et de surtout pas s'approcher.
Le préréglage offensif aide, mais regarde ce qu'il fait derrière. C'est pas un bouton victoire.
Ça dépend aussi du stuff non ? S'il a zéro résistance je comprends qu'il hésite.
Oui mais fuir pendant tout son bonus c'est pas terrible non plus.
J'ai gardé 2 versions. La prudente gagne parfois avec plus de pv, l'autre va plus vite. Pas trouvé un réglage meilleur partout.
Un seul combat ça dit pas grand chose, surtout avec un crit qui tombe au bon moment. Lance les 6 duels.`,
`La plage pour faire découvrir le jeu ?
Je cherche un truc court pour les potes. Pas envie de leur expliquer 40 sorts avant la première partie, celle-là suffit ?
3 ennemis et un héros fourni, oui ça se lance vite.
Fais un tour à la main avant de montrer l'IA. Sinon ils voient des chiffres bouger et savent pas pourquoi.
Je ferais l'inverse justement, regarder un tour puis reprendre depuis le début.
Les deux marchent, faut juste pas lancer la lecture en x8 d'entrée.
Notre discussion va de toute façon bloquer sur le roi de la serviette pendant dix minutes
C'est une porte d'entrée respectable. J'ai découvert les PA en tapant un mec sur la plage.`,
`On perd Brice sur le sable non ?
sur mon écran le jaune se confond avec le sol quand je dézoome. Y'a moyen de lui changer juste la couleur ?
Oui dans ta copie, la couleur de silhouette. Ça touche pas ses stats.
Le cercle aide aussi. Mais je suis d'accord, jaune clair sur beige c'est moyen.
Perso orange un peu foncé, c'est moins fidèle mais au moins je le retrouve.
Le portrait dans la timeline marche si t'as un doute sur qui est où.
Je préfère un contour foncé à changer toute la couleur. Après faut refaire l'image quoi.
Brice orange ça va faire débat, mais perdre parce qu'on voit pas son perso c'est pire.`],
asterix: [
`La potion tour 1, bonne idée ou pas ?
Je la bois direct mais j'arrive à portée de personne. Ça sert quand même ou je viens de payer des PA pour me promener ?
Si tu touches rien pendant le bonus, attends un peu oui.
Chez moi tour 2. Potion puis frappe, ça change déja beaucoup.
C'est pas juste le numéro du tour, regarde si tu peux taper après. Selon le départ ça peut marcher tour 1.
Et utilise les piliers, le centurion tire pas à travers.
Mon IA buvait avant chaque grande randonnée. J'ai corrigé ça avant de toucher aux dégâts.`,
`Mon éclaireuse se jette entre les légionnaires
j'ai mis une priorité pour avancer vers le chef. Résultat elle passe devant tout le monde et prend trois claques, beau plan
Tu scores juste la distance ? Regarde aussi qui peut la taper sur la case d'arrivée.
Pas obligé de dépenser tous les PM. J'ai mis du temps à accepter ça avec mon bot.
+1. Une case de moins et parfois t'as le pilier qui coupe un tir.
Le labo montre les cases envisagées, pratique pour voir pourquoi elle a choisi la pire.
« la pire » pour toi. Pour ton calcul qui récompense d'être près, elle fait exactement ce que tu demandes :D
C'est pour ça que je change un truc à la fois maintenant. Sinon impossible de retrouver le poids qui l'envoie au casse-pipe.`,
`Quoi expliquer à un pote avant la patrouille ?
Il connaît Astérix, pas le jeu. Je lui explique les stats avant ou je le laisse cliquer ?
PA pour taper, PM pour bouger, fin de tour. Le reste après.
Dis lui quand même que la potion agit tout de suite. J'ai attendu un tour pour rien au début.
Je ferais une frappe avec lui puis je le laisse faire. Le pavé d'explications avant de jouer, personne écoute.
Moi j'aime bien lire mais oui faut pas une conf de 20 min pour trois romains.
Et le i pour les sorts. Ça évite de tout lui réciter à chaque fois.
Attention après il va vouloir refaire tout son village dans l'atelier. C'est comme ça qu'on perd sa soirée.`,
`Le centurion finit un peu en sac à pv
une fois les deux gardes morts il fait plus trop peur. Pour une intro vous laisseriez comme ça ?
Oui, t'as choisi les bonnes cibles, t'es récompensé. Tout doit pas être tendu jusqu'au dernier pv.
D'accord mais la fin pourrait être plus courte. Lui rajouter de la vie réglerait rien.
Essaie les départs autrement dans une copie. Un garde qui couvre le côté ça change le début sans rallonger la fin.
Faut garder un passage quand même, j'ai déjà fait une carte où on pouvait juste pas se rejoindre...
Vue collisions dans l'éditeur avant de tester, ça évite ça.
Je préfère 4 tours avec un choix intéressant que 12 à finir le menhir.`],
kaamelott: [
`Le faux Graal ça compte ou on s'est fait avoir ?
J'ai ramené la coupe. Le texte me donne pas très confiance sur le sérieux de cette quête
T'as le reçu ?
Ça me semble être le seul critère valable ici.
Blague à part, ralentissez le gardien. Au cac sans retrait je me suis fait ouvrir.
Oui trois sorts c'est bien pour apprendre. Quand y'en a vingt je lis juste celui qui tape le plus.
On peut dupliquer la salle et mettre deux héros pour une coop. Gardez l'original parce que le réglage à deux sera pas le même.`,
`Une IA lâche mais pas TROP lâche
Je veux un chevalier qui tient à ses pv. Pas un mec qui fait le tour du pilier pendant dix tours. Vous mettez quel seuil ?
Commence vers 35% et regarde ce que ça donne, mais c'est pas une valeur magique.
Le souci c'est souvent le repli. Il cherche un soin, y'en a pas, puis il sait plus quoi faire.
Une attaque disponible en deuxième choix, puis déplacement. Sinon oui il va hésiter longtemps.
Je mettrais aussi moins de prudence quand il peut finir un ennemi. Fuir un gardien à 3 pv c'est triste.
Ça dépend s'il peut le finir à coup sûr. J'ai perdu là-dessus avec un petit jet.
On dirait mon chevalier, courageux sous réserve d'approbation du comptable.`,
`Qui teste ma crypte modifiée ?
j'ai changé deux sorts et les départs du faux Graal. Pour l'envoyer je prends le donjon seul ou faut aussi les persos ?
Le donjon prêt à jouer contient ses héros et leur stuff. Un zip suffit.
Vérifie que t'as mis le bon héros DANS l'aventure, pas seulement changé ton perso à côté. Je me suis fait avoir.
Et réimporte dans un navigateur vide. Chez toi les vieilles images peuvent masquer un oubli.
Je peux regarder le nombre de tours, par contre je promets pas de jouer correctement :p
Justement c'est utile aussi. Si ça marche uniquement avec le créateur à côté pour expliquer, y'a un souci.
Mets un numéro dans le nom du fichier stp, j'ai déjà trois « final » dans mes téléchargements.`,
`Personne lit mon intro de quête
j'ai écrit tout un dialogue et mes potes ont cliqué jouer direct. Je raccourcis à quel point ?
Trois lignes. Où on est, quoi faire, pourquoi c'est un problème.
Perso je lis tout mais APRES le combat. Avant j'ai juste envie de tester.
Garde le lore dans la présentation du monde, ceux qui veulent pourront le lire. Moi je zappe pas parce que c'est long, je zappe quand je sais pas encore à quoi ça correspond. Le gardien je veux bien son histoire une fois que je l'ai vu. Avant, son nom et ses douze cousins ça me dit rien.
La blague de victoire marche mieux aussi, t'as plus un pote qui te dit « bon tu joues ? »
Ça dépend du public. Pour une campagne à histoire j'aime une vraie intro, pas juste « tue les 3 gardes ».
Oui mais la généalogie du gardien peut attendre la salle 2 quand même.`],
starwars: [
`L'IA essaie de tirer à travers le pilier...
Trois fois le même tir impossible. Elle insiste. Moi aussi j'insiste à regarder en espérant un autre résultat
Tu vérifies la ligne de vue ou juste la portée ?
Faut passer par la vérification de lancer. La distance suffit pas.
J'avais fait pareil. Le moteur refuse le tir mais il invente pas une autre action à ta place.
Une sortie vers Maison si ta règle trouve rien, ça évite pas mal de tours gâchés.
Et garde le compteur d'actions invalides ouvert. Les victoires cachent ce genre de bug quand le perso est bien stuff.`,
`Se décaler d'UNE case, c'est trop demander ?
Mon tireur avance vers la cible mais reste derrière le pilier. Il économise bien ses PM sauf que le tir passe toujours pas
Teste la ligne de vue depuis la destination, pas depuis le départ.
Le studio montre les attaques possibles après le déplacement. Ça aide plus que juste regarder la flèche.
J'ai eu le cas, j'avais récompensé « plus près » sans vérifier « peut tirer ». Pas la même chose.
Parfois faut même reculer d'une case pour avoir l'angle.
Oui, et si tu corriges pour un seul pilier ça va recasser sur la map suivante. Change le départ pour tester.
Mes règles spéciales finissent toutes par un repli Maison. Je suis pas prêt à coder la galaxie entière.`,
`Partager le relais sans compte ?
on veut juste tester à deux, pas publier. Mon pote peut importer le zip sans s'inscrire ?
Oui, le compte c'est pour la communauté, pas pour le jeu local.
Le salon entre amis non plus n'en a pas besoin. Il faut échanger invitation et réponse.
Gardez les onglets ouverts pendant ça. J'ai fermé le mien en copiant le lien, forcément ça marchait moins bien.
Et localhost c'est pas l'adresse de ton PC chez ton pote, au cas où. Il lui faut accès au site aussi.
Ça a l'air évident mais j'ai envoyé mon lien local avant de comprendre...
Le vrai boss du relais c'est d'arriver tous les deux dans le salon. Après les sentinelles ça va.`,
`Mon boost ressemble trop à mon tir
j'ai tout mis en violet avec le même effet. Très joli, on comprend rien. Vous différenciez comment ?
Une aura pour le boost, un projectile pour tirer. Déjà ça se lit sans changer les couleurs.
Le son aussi, ça aide.
Ouais mais faut que ça marche en muet quand même. Je joue souvent sans son.
Le journal garde le nom du sort si tu veux vérifier ce que l'IA vient de faire.
J'éviterais surtout les flashs énormes qui cachent les persos. Ça saoule vite en combat.
J'ai fait cette erreur sur une copie, plus de lumière que de cases. Maintenant je teste les effets en petit avant.`],
rings: [
`Le capitaine ou les petits d'abord ?
j'ai tout mis sur le capitaine. Résultat coincé au gué avec les éclaireurs sur les côtés. Vous faites comment ?
Les petits. Ils sont moins longs à tuer et ils ferment le passage.
J'en ralentis un et je tombe l'autre. Le capitaine attendra gentiment son tour.
Pas toujours les petits non plus, si le chef est finissable prends le kill. Mais au départ oui.
Le passage m'a trompé avec le décor. J'avais cru pouvoir contourner par le bas.
Premier essai d'une map je passe en tactique, juste pour regarder les obstacles. Après je remets le décor.`,
`Mon rôdeur ignore celui qui bloque le gué
J'avais fait une priorité chef. Il tire dessus pendant qu'un éclaireur lui bloque la seule sortie. Je peux noter le passage libéré ?
C'est plus utile que le nom de la cible en tout cas.
Tuer un bloqueur peut éviter trois tours de détour. Même s'il tape pas fort.
Ça dépend s'il te bloque vraiment. Des fois tu peux juste te décaler et taper le chef sans perdre ton tour.
Regarde les déplacements légaux avant de mettre une grosse priorité à tous les ennemis proches.
Je teste aussi avec les deux éclaireurs inversés. Sinon mon IA apprend juste le départ que j'ai sous les yeux.
Une règle qui marche seulement au gué, bon... pour une IA du gué pourquoi pas. Mais faut pas l'appeler généraliste :p`,
`Le gué à deux héros, devenu trop facile
j'ai ajouté un pote dans la salle. On nettoie avant qu'ils arrivent, même avec notre placement éclaté. Je double les pv ?
Non pitié, ça fait juste une fin plus longue.
Rapproche un des éclaireurs sur le côté. Là vous pouvez pas tous les deux viser la même cible tranquille.
Un peu de pv en plus peut aider quand même. C'est pas interdit, faut juste pas faire que ça.
Compare les tours ET les dégâts pris. Plus long veut pas forcément dire plus dur.
Gardez la version solo séparée. J'aime bien ce petit format, j'aimerais pas qu'il disparaisse pour la coop.
Deux variantes dans le même monde ça irait. Avec « solo » et « duo » dans le nom, qu'on se trompe pas.`,
`Joli décor, mais je marche dans un rocher
J'ai refait le fond du gué et peint un gros caillou dessus. Sauf qu'on passe à travers. Je dois le mettre où pour bloquer ?
Dans le terrain. Le dessin du fond change pas les collisions.
Fais ton sol sans les gros obstacles et ajoute ceux-là dans l'éditeur, sinon c'est trompeur.
Le gabarit aide à les placer. J'avais tout décalé d'une demi-case au premier essai.
Mode tactique puis décor puis tactique, tu vois vite si les deux racontent la même carte.
Et teste en zoomant, une pierre qui dépasse cache parfois la case d'à côté.
Je préfère une map moins chargée où je vois les passages. Les brumes sur tous les pieds c'est beau cinq secondes.`],
dofus: [
`Vous reprenez avec quel duo ?
salut, gros zip installé, j'ai retrouvé les classes et mes vieux réflexes douteux. Vous conseillez quoi comme duo tranquille pour recommencer ?
Ce que tu connais déjà franchement. Lire 20 sorts par tour pour le BR ça va te dégoûter.
Iop eni ici. Rien de fou mais pour tester mes IA je vois direct quand elles font nimp.
Osa de mon côté. Pas un souci de dégâts, juste 800 tours d'invocs avant de rejouer mdr
Limite les invocs quand elles peuvent rien atteindre. Poser un tofu tout au fond juste parce que c'est dispo, ça aide pas.
Au passage marteau sur case vide ça marche. J'avais oublié et je ratais toutes mes zones à deux mobs.
question bête, les exos restent si on ferme le navigateur ? Pas envie de refaire ma FM à chaque fois
Oui, même navigateur et même adresse. Exporte quand même ton stuff avant de nettoyer les données du site. J'insiste parce que je confondais : ton compte du forum c'est pas une sauvegarde de tes persos. Tu peux te reconnecter, voir tes messages, et avoir quand même perdu les trucs locaux si t'as vidé les données. Le zip évite ça.
Perso sacri eni, je suis pas original non plus. Les compos bizarres on verra quand j'arrêterai de bloquer mes propres lignes de vue.`,
`Osa qui invoque au fond de la map
Mon osa pose ses invocs loin, elles mettent trois tours à venir et il en remet entre temps. Y'a un réglage simple pour calmer ça ?
Regarde le nombre déjà en jeu avant d'en poser une autre. Ça limite les dégâts déjà.
J'avais mis invoc avant attaque, même avec un mob à 10 pv il sortait un tofu. Donc regarde aussi l'ordre.
Kill possible, puis invoc utile, puis attaque en repli. Je commencerais là, pas besoin de 15 conditions.
Et les boosts sur les invocs, vous les placez quand ?
Quand y'a une cible et qu'elle pourra s'en servir. Booster un bouftou à l'autre bout pendant qu'il marche bof.
Test sur le BR avant les gros donjons. Au moins tu vois rapidement si la règle fait ce que tu voulais.`,
`Faut retélécharger tout le catalogue à chaque fois ?
Mon pote a mis un moment à chopper la bibliothèque. Demain on doit refaire ça ou elle reste ?
Elle reste dans son navigateur après installation.
Avec les sons, coiffes etc aussi. C'est pas juste la liste des objets.
Même adresse et même navigateur par contre. Chrome et Firefox partagent pas ton import.
Navigation privée à éviter pour ça oui.
Et le catalogue c'est pas la sauvegarde de tes persos. Exporte les stuffs modifiés à côté.
Je confirme le piège du nettoyage navigateur. Le compte du forum remet pas magiquement la FM. Gardez vos zip.`,
`Furie + Furie, le +do compte bien direct ?
J'arrive pas à voir avec les jets. Le deuxième lancer profite du premier ou faut attendre le tour suivant ?
Direct. Premier lancer sans ce bonus, deuxième avec celui du premier.
Deux Furies grade 5 = +16 do acquis après les deux. Pas +16 sur les deux attaques déjà passées hein.
Regarde aussi la case visée. Si tu changes la place dans la zone tu compares plus la même chose.
Et les résis du mob. Le chiffre final c'est pas juste base + bonus.
Le Poutch c'est plus simple pour tester ça, même cible même case.
Je m'étais fait avoir sur les zones aussi. Je comparais centre et bord en pensant avoir trouvé un bug.`],
onepiece: [
`Coincé entre les caisses dès le début
je conseille de la faire une fois à la main avant de lancer l'IA. Mon bot se bloque au quai, moi aussi. On se vaut
Les caisses bloquent les tirs aussi ou juste les déplacements ?
Sur cette carte les deux. Regarde en tactique, faut se décaler pour tirer.
Ah voilà, j'avais compté la portée mais pas la ligne de vue.
Une case sur le côté suffit parfois, pas besoin de traverser toute la map.
Une suite sur le bateau ça serait cool. Plus étroit, mais pas trois tours de marche avant de toucher quelqu'un svp.`,
`Ralentir AVANT de partir en courant
Ma navigatrice fuit bien mais fait que ça. Je voudrais qu'elle retire des PM d'abord quand l'ennemi va la rejoindre
Vérifie le retrait depuis la case actuelle avant de chercher où partir.
Et derrière tu peux laisser Maison choisir le déplacement, pas obligé de tout écrire toi-même.
Faut que le retrait serve à quelque chose aussi. Ralentir celui qui est déjà à l'autre bout ça fait joli mais bon.
Je limiterais aux ennemis qui peuvent te rejoindre, pour commencer.
Parfois taper est mieux. Si tu peux finir le gars, plus besoin de lui retirer ses PM.
Le nombre de tours sans attaque dans le rapport m'a aidé à voir ça. Mon bot « prudent » faisait surtout du tourisme.`,
`J'ai enlevé une caisse au quai
ça accélère bien la salle, mais j'ai peur d'avoir viré le seul placement intéressant. Vous préférez ouvert ou serré ?
Ça dépend combien tu prends en retour. Plus rapide et plus risqué, ça peut être un vrai choix.
Perso ouvert. Je supporte plus les combats où le dernier ennemi passe sa vie derrière un obstacle.
Moi je garderais au moins un abri, sinon autant faire un grand carré vide.
Fais deux variantes dans le zip, on pourra comparer avec le même perso.
Oui mais donne leur des noms différents. « Quai v2 final » ça dit pas ce qui change.
Quai ouvert / quai encombré, ça suffit. Le titre a pas besoin d'un scénario à lui tout seul.`,
`Le cordage m'a sauvé plus que l'attaque
j'ai enfin fini sans être à 2 pv. J'ai juste ralenti le garde du haut au lieu de le taper, comme quoi lire les sorts ça sert
Un tour où il te touche pas c'est énorme.
C'est le piège du petit chiffre. -PM ça a l'air nul à côté des gros dégâts, jusqu'à ce que le mec puisse plus venir.
Attention quand même, s'il tire à distance le retrait le gêne moins.
J'aimerais bien une classe basée là-dessus. Pas forcément gros dégâts, juste casser les tours adverses.
Avec une faiblesse quelque part alors. Retrait + soins + gros dégâts à longue portée ça va faire beaucoup.
Trois sorts bien différents pour commencer. Mes premiers kits avaient dix façons de faire quasiment pareil.`],
dragonball: [
`Mon bot charge pour un combat qui n'arrive jamais
j'ai mis priorité boost. Il charge puis recule. Puis revient. Puis recharge. J'ai créé un abonnement à la salle de sport
mdr regarde la prudence, elle contredit peut-être ton boost
Et la durée du bonus. S'il expire pendant la promenade, c'est des PA perdus.
Je ferais une condition pour garder de quoi taper après la charge.
Pas toujours obligé de taper le même tour, mais faut au moins un plan derrière oui.
Compare sur plusieurs maps après. J'ai amélioré mon bot ici puis il s'est mis à foncer dans le tas partout ailleurs.`,
`Il me manque 1 PA après la charge
Mon IA se booste et peut plus lancer Vague de ki. Elle mange les coups du maître en attendant. Je veux éviter ce tour pour rien
Compte le coût des deux sorts avant de booster. C'est le premier truc à vérifier.
Si le bonus dure assez longtemps ça peut se défendre, mais face au maître je préfère taper direct.
Moi je cherche un coup fatal avant tout. Le meilleur buff c'est parfois un ennemi mort.
Tant que ton coup fatal compte pas sur le jet max...
Oui, et fais gaffe à l'ordre des blocs. Deux règles qui ont l'air bien séparées peuvent se gêner.
Le mode lent pour lire UNE décision, ça m'aide plus que dix combats en accéléré.`,
`Petit tournoi entre potes avec le même élève
On veut chacun faire une IA. Même perso pour tous, mais vous laissez le stuff libre ou ça fausse tout ?
Si tu veux comparer les IA, même stuff.
Libre c'est marrant aussi mais c'est plus le même concours. Tu notes le build avec.
Pour le premier essai je figerais tout sauf le bot. Et on inverse les départs.
Question au passage, en public tout le monde récupère le code ?
Les classements montrent les résultats et l'empreinte de l'IA. Un export de ton code que tu envoies toi-même, là oui le destinataire peut le lire.
Nous le perdant ramène les croissants. Ça motive plus que trois points dans un tableau.`,
`Mon rayon cache la moitié de la map
j'ai voulu faire un gros effet, résultat je vois plus le maître ni sa barre de vie. Stylé pendant une seconde, pénible après
Réduis la taille et la durée. La sensation de puissance vient pas que du nombre de pixels.
Une couleur bien différente de la charge suffit déjà à comprendre ce qui part.
Et pas obligé de secouer tout l'écran pour une petite attaque svp
En petit ça devient vite une tache. Teste sur tel si tu peux.
Le son aide mais faut voir la différence même en muet.
Je garde la grosse version pour faire joli dans l'aperçu. En combat faut surtout que je voie où cliquer ensuite.`],
pokemon: [
`Attention c'est pas la table des types habituelle
je me suis fait avoir, vert veut pas dire faible au feu ici. Les couleurs donnent pas les mêmes règles que dans les jeux Pokémon
Ah merci j'allais demander, mon plan « super efficace » avait pas fait grand chose.
C'est les résistances dans la fiche qui comptent, puis l'élément du sort.
Perso ça me va, sinon faudrait refaire l'IA pour chaque univers.
Oui mais une phrase dans l'intro aiderait. On vient forcément avec les habitudes des jeux.
Le grimoire reste le plus simple, y'a que trois sorts à lire sur le héros de départ.`,
`Je lis quoi pour choisir l'élément avec mon IA ?
Je veux pas coder la table Pokémon alors qu'elle existe pas ici. C'est bien les résis de la cible qu'il faut regarder ?
Oui, et l'élément du sort, pas le nom ou la couleur du monstre.
Un ennemi vert peut être résistant feu. Mon premier script a eu du mal avec ce concept :D
Les effets particuliers faut les lire dans les données. Si c'est pas défini, le moteur va pas l'inventer.
Maison regarde déjà les résistances. Tu peux partir de là plutôt que tout refaire.
Je veux quand même tester ma propre règle, juste pour comprendre les calculs.
Alors compare avec le même perso contre une cible dont tu changes juste une résistance. Tu verras vite si ton choix suit.`,
`La clairière sans passer par la création ?
je veux la montrer à mon petit frère. Il peut prendre le héros fourni et jouer direct ou faut préparer un stuff ?
Tout est fourni, import puis jouer.
Pas besoin de compte non plus pour la partie locale.
Garde le zip pour le mettre sur un autre appareil. Le compte synchronise pas les créations du navigateur.
Trois sorts c'est bien pour commencer. Laisse-le tester avant de lui montrer les dix curseurs de l'éditeur.
Je lui montrerais quand même la couleur du perso. Il va passer dix minutes dessus, mais c'est la règle.
Chez nous tout finit violet avec des éclairs. Ça a au moins le mérite d'être un choix artistique clair.`,
`Je confonds le gardien avec les petits
De loin les silhouettes se ressemblent. Je peux changer seulement celle du boss dans ma copie ?
Oui, sa couleur déjà. Pas besoin de refaire tout le pack d'images pour ça.
Le portrait et les PV aident à le retrouver aussi.
J'ai mis le mien plus sombre, ça suffit sur mon écran.
Évite juste de le rendre énorme, après il cache les cases derrière.
Un boss immeuble pour trois ennemis dans une clairière, ça se discute quand même ^^
Je préfère des silhouettes lisibles à de beaux dessins qui se chevauchent. Les images détaillées viendront après.`],
visiteurs: [
`La boue c'est mon meilleur sort en fait
2 essais à taper le gardien au cac, 2 défaites. Puis j'ai lu le retrait PM. J'aurais pu commencer par là
Le sort qu'on ignore parce qu'il fait pas de gros chiffre, classique.
Il esquive le retrait ou ça passe forcément ?
Regarde la fiche du sort. Et garde une sortie même si tu comptes le ralentir, fais pas dépendre tout ton tour d'un retrait réussi.
Oui, un plan qui marche seulement si tout passe c'est souvent un plan pour recommencer.
J'aimerais bien que le portail serve de sortie un jour. Pour l'instant faut battre le groupe, pas juste marcher dessus.`,
`Il relance la boue alors qu'elle est en relance
Ma règle regarde la distance et choisit la boue. Sauf que le sort est plus dispo et l'IA insiste. Je manque quoi ?
La disponibilité du sort, justement. Portée ok veut pas dire lancer autorisé. Il y a aussi les PA, la relance et la limite sur la même cible. Vérifie le lancer complet, sinon tu vas corriger la boue et retrouver le même problème avec le sort suivant.
Une sortie « sinon Maison » si ta branche trouve rien, pour commencer.
Le moteur refuse le sort, mais ça change pas tout seul la condition que t'as écrite.
J'ai eu la même avec une limite par cible. Le bot croyait juste qu'il pouvait recommencer.
Le compteur d'actions invalides dans les tests sert bien pour ça.
Et teste un tour entier, pas juste la première action. C'est souvent au deuxième lancer que les bêtises commencent.`,
`Si je prête mon écuyer, il garde sa version ?
j'ai bricolé le perso, mon pote veut le tester. S'il change des sorts chez lui ça change le mien aussi ?
Non, son import c'est une copie.
Faut qu'il te renvoie son export si tu veux ses modifs.
Mettez des noms distincts, sinon bonne chance pour retrouver qui avait le sort à 3 PA et qui l'avait à 4.
Un numéro de version et deux lignes de notes ça suffit. Pas besoin d'un roman.
Je garde aussi l'original à côté. Mon dossier téléchargement est déja une catastrophe, je peux pas compter sur ma mémoire.
Écuyer v1 : perdu. Écuyer v2 : perdu mais avec un meilleur sort. Progrès.`,
`Je pensais que la boue faisait rien
pas de gros dégâts à l'écran, j'avais cru que le sort ratait. En fait je regardais pas les PM de la cible...
Oui c'est un retrait, pas une attaque.
Le tour de l'ennemi te montre vite la différence quand il s'arrête une case trop loin.
Faudrait mettre « ralentit l'approche » dans la description avant la valeur technique je trouve.
D'accord mais gardez le nombre exact dessous. Pour régler l'IA on en a besoin.
Les deux peuvent tenir en deux lignes, pas besoin de choisir.
Perso j'ouvre le grimoire avant la salle maintenant. Ça m'évite de découvrir le troisième sort après deux défaites.`],
naheulbeuk: [
`Même les stagiaires tapent fort
j'ai pris le couloir du milieu, les trois se sont mis autour. J'ai rien compris à part que mon contrat couvre pas ça
Contourne le premier obstacle. Tu peux les faire venir un par un.
Et tue un stagiaire avant le chef, ça enlève déjà une source de dégâts.
J'aime bien les trois sorts, au moins je finis par les lire tous.
Prime puis frappe dans le même tour. Pas prime puis fin de tour comme moi au premier essai.
Le héros fourni évite surtout une heure de création avant de montrer le jeu à quelqu'un. Bon format pour ça.`,
`La prime de risque quand y'a personne à portée
Mon bot réclame sa prime puis marche. Le bonus part avant qu'il tape. Je peux juste modifier ça sans refaire toute l'IA ?
Oui, une condition sur l'attaque possible après le boost et Maison derrière.
Vérifie les PA restants aussi, portée ok mais plus de quoi frapper ça sert pas beaucoup.
C'est mieux de changer un seul morceau. J'ai essayé de tout réécrire, mon perso savait même plus contourner un mur.
Garde l'ancienne version pour comparer, même si elle te semble nulle.
On gagne parfois sur cette salle juste avec un meilleur jet. Les comparaisons à plusieurs tirages servent à ça.
Le bot qui attend le bon moment pour sa prime est plus raisonnable que moi au boulot.`,
`Une soirée : chacun modifie trois trucs
on part de la petite salle, chacun change 3 trucs puis on échange les zip. Des gens pour tester sans avoir l'original installé ?
Je peux essayer dans un navigateur vide. Ça repère les images oubliées.
Je vais toucher aux sorts des gardes, pas envie de juste gonfler les pv.
Mettez quand même une phrase pour dire le piège principal. Je veux bien perdre, pas lire dix fiches avant le premier clic.
Moi je préfère découvrir le piège, sinon autant donner la solution.
Un indice sans la solution alors ? Genre « les deux gardes ne font pas la même chose ».
Notez les tours aussi. Si le couloir des formulaires prend une demi-heure, j'abandonne le dossier.`,
`J'avais lu que les sorts du chef
les stagiaires ont leurs propres trucs en fait. Je les ai ignorés et ils m'ont bien fait payer. Vous les tuez d'abord ?
Oui chez moi, un petit mort vite c'est mieux que trois ennemis blessés qui jouent encore.
Le grimoire a leur portrait aussi, tu peux lire tous les sorts avant de choisir.
Ça dépend lequel est à portée quand même. Je traverse pas la map pour finir un stagiaire loin.
Pour une suite je verrais bien un soigneur derrière, ça changerait les priorités.
Un seul suffit. Pas besoin de rajouter douze mobs pour que ça soit différent.
D'accord, petite équipe avec des rôles différents. La paperasse du donjon est déjà assez longue.`],
wakfu: [
`Un combat court pour tester les IA
je cherchais justement trois ennemis et une petite carte. Pas une armée où j'attends 15 minutes pour voir si mon réglage sert à quelque chose
Tu regardes en vitesse normale ou tu mets direct l'accéléré ?
Normal pour le premier essai perso. Sinon je vois que ça gagne mais pas pourquoi.
Le rapport de décision aide aussi. J'ai trouvé un soin qui passait devant toutes mes attaques.
Teste ailleurs ensuite. Mon bot était très fort dans ce jardin et complètement perdu sur une carte ouverte.
Oui, jardin pour vérifier une règle vite, labo pour comparer vraiment.`,
`Il se soigne de 10 pv au lieu de finir le mob
J'ai mis soin dès que la vie est pas pleine. Je découvre que c'était peut-être pas mon idée du siècle
Il suit la consigne hein :p baisse le seuil déjà
Et priorité au kill certain. Dix pv soignés servent pas si tu prends trente derrière.
Sauf si l'allié va mourir avant de rejouer. En équipe c'est moins simple.
Oui là je parlais du dernier ennemi face à ton seul perso. Avec plusieurs alliés faut regarder qui joue après.
Le gain réel du soin surtout, pas le maximum écrit sur le sort. Si t'as perdu 10 pv tu récupéreras pas 80.
Je teste d'abord solo puis en équipe, sinon j'arrive plus à comprendre ce qui a fait changer la décision.`,
`Partager le jardin avec mes placements
J'ai rapproché les départs pour enlever le premier tour de marche. J'envoie le terrain seul ou tout le donjon à mon pote ?
Tout le donjon pour qu'il lance directement. Carte, persos et ennemis ensemble.
Pense à vérifier chaque salle si t'en as plusieurs. J'avais modifié la mauvaise sans m'en rendre compte.
Dans un navigateur vide c'est le test le plus simple. Tu vois exactement ce que ton pote va recevoir.
Garde quand même l'ancienne version, si tu rapproches trop tu peux te faire taper avant d'avoir choisi quoi faire.
Ça dépend qui commence aussi. Compare les deux départs si c'est pour tester une IA.
Une modif à la fois, c'est pas le plus fun mais au moins tu sais pourquoi ça change.`,
`Petite map > trois tours à marcher
franchement je préfère ce format. Sur les grandes cartes avec 3 mobs je passe mon temps à avancer, ici y'a un choix dès le début
Pareil, les grandes maps c'est bien pour les armées. Pas pour courir après le dernier archer.
Faut quand même de la place pour contourner, sinon ça devient un couloir où tu tapes le premier venu.
Deux chemins ça suffit souvent. Pas besoin de vingt obstacles.
Attention aux portées aussi. Si tout le monde touche partout, les chemins changent pas grand chose.
Oui je préfère réduire une portée plutôt que planter un pilier devant chaque case libre.
Moi j'aime les deux formats. Mais si la map est grande faut une raison, pas juste parce qu'on peut la faire grande.`]
};

const generalBlocks = [
`Je ferme le navigateur, mes bibliothèques restent ?
question bête : j'ai importé une salle, je peux fermer maintenant ? J'ai peur de devoir tout recommencer demain
Oui, c'est enregistré dans ton navigateur.
Garde quand même le zip. Si tu effaces les données du site tu perds la copie locale.
Et je retrouve mes stuffs sur un autre PC avec mon compte ?
Non, le compte c'est la communauté. Pour tes créations locales faut exporter puis importer sur l'autre PC.
Même piège en navigation privée. Ça marche pendant la session mais c'est pas là que je garderais mes persos.`,
`J'ai commencé 8 salles et fini zéro
vous partez sur combien pour une première création ? J'ai plein d'idées mais ça avance pas, je passe la soirée dans les réglages
Une. Finie. Jouable par un pote sans toi derrière pour expliquer.
3 mobs, 3 sorts chacun chez moi. Si je commence plus grand je m'éparpille.
Je suis pas contre deux salles, ça permet de tester la progression. Mais faut finir la première avant de faire les sept autres.
Teste le combat avant d'écrire tout le lore aussi. Tu peux raconter un truc génial et avoir 4 tours de marche au début.
Le lore je le garde dans un fichier à côté. Ça me frustre moins que de supprimer mes idées, et ça bloque pas la salle en cours.`,
`Vos pires placements
je commence : finir entre deux ennemis parce que « ça me rapproche ». Ça me rapproche de la défaite surtout
Le soin sur la mauvaise cible. Depuis je vise avec les portraits.
Le marteau sans regarder la zone, grand classique. Mon allié a apprécié.
Moi je boostais à la fin du tour en pensant que ça commençait au suivant...
Ça ferait de bons petits tutos ces cas-là. Plus parlant qu'un tableau de 40 règles.
Le grimoire m'évite les surprises maintenant. Enfin celles des sorts, pour les erreurs de clic j'ai pas encore trouvé de soin.`,
`Une victoire ça suffit pas à dire que mon IA est meilleure ?
Je change un poids, elle gagne, je suis content. Je relance elle se fait ouvrir. Vous comparez comment sans y passer la nuit ?
Même perso, même stuff, mêmes conditions. Plusieurs tirages sinon tu testes surtout la chance. Perso je change UNE règle, je sauvegarde sous un autre nom, puis je compare à la version précédente. Si ça gagne une fois de plus mais avec plein d'actions invalides je garde pas. C'est moins marrant que de bidouiller direct après une défaite, mais au moins je sais ce que j'ai testé.
Inverse les camps aussi. Le premier à portée a parfois un gros avantage.
Je garde l'ancienne IA comme adversaire, c'est plus clair que « elle avait l'air mieux hier ».
Regarde les actions invalides et les tours, pas que les victoires. Gagner en 30 tours ça peut rester une IA chiante à regarder.
Les 6 duels du labo c'est un début. Pas une preuve absolue, mais déjà mieux que retoucher après chaque crit adverse.`,
`Une soirée avec des petites salles maison ?
l'idée : chacun ramène une salle de moins de 10 tours. Pas besoin de belles images, juste un truc qui marche sans 1h de config
Partant, je tenterais bien un seul ennemi avec plusieurs façons de l'approcher.
Un seul oui mais pas juste une barre de pv interminable stp
Je peux vérifier les imports dans un navigateur vide. C'est souvent là qu'on voit les trucs oubliés.
Mettez le nombre de héros dans la présentation, qu'on sache si on peut lancer à deux.
Et gardez les versions précédentes. Si on trouve un réglage pire on doit pouvoir revenir, pas refaire tous les sorts à la main.`,
`Peur de casser Maison en bricolant
si je crée ma version dans le studio, je peux toujours revenir à l'originale ? Je connais rien au code pour l'instant
Oui, ta copie est séparée. Donne lui juste un autre nom.
Commence par un truc qui t'énerve en combat. Un soin trop tôt, un déplacement inutile. Pas dix règles d'un coup.
Le prompt peut aider mais relis le résultat. Une IA qui te pond du texte sûr d'elle a pas forcément compris ta stratégie.
Le repli surtout. Si elle trouve pas son action idéale, elle doit quand même savoir quoi faire.
J'avais fait « soigne dès qu'il manque de la vie ». Ça tournait très bien, ça gagnait jamais. Au moins le bug était facile à trouver.`
];

function parse(block) {
  const [title, ...lines] = block.split('\n');
  return { title, lines };
}
module.exports = {
  worlds: Object.fromEntries(Object.entries(blocks).map(([key, values]) => [key, values.map(parse)])),
  general: generalBlocks.map(parse),
};
