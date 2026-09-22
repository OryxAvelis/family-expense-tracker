export type ServiceScope = "family" | "personal";

export type ServiceTemplate = {
  id: string;
  title: string;
  emoji: string;
  price: number;
  duration: string;
  description: string;
  steps: readonly string[];
  gradient: string;
  scope: ServiceScope;
};

export const SERVICE_TEMPLATES: readonly ServiceTemplate[] = [
  { id: "laundry", scope: "family", title: "Étendre le linge", emoji: "🧺", price: 500, duration: "15–25 min", description: "Le Buyer de la famille prend le linge propre et l’étend soigneusement pour faciliter le séchage.", steps: ["Prendre le linge lavé", "Secouer et espacer chaque pièce", "Fixer correctement avec les pinces"], gradient: "from-sky-100 via-cyan-50 to-white dark:from-sky-950 dark:via-cyan-950/60 dark:to-card" },
  { id: "garbage", scope: "family", title: "Sortir les poubelles", emoji: "🗑️", price: 200, duration: "5–10 min", description: "Le Buyer de la famille ferme les sacs, les descend et les dépose dans le conteneur adapté.", steps: ["Rassembler et fermer les sacs", "Vérifier qu’aucun sac ne fuit", "Déposer dans le conteneur extérieur"], gradient: "from-slate-100 via-zinc-50 to-white dark:from-slate-900 dark:via-zinc-900/70 dark:to-card" },
  { id: "gas", scope: "family", title: "Changer la bouteille de gaz", emoji: "🔥", price: 500, duration: "10–15 min", description: "Le Buyer de la famille remplace la bouteille vide et contrôle le raccord avant utilisation.", steps: ["Fermer l’arrivée de gaz", "Installer et serrer la nouvelle bouteille", "Vérifier l’absence de fuite"], gradient: "from-orange-100 via-amber-50 to-white dark:from-orange-950 dark:via-amber-950/60 dark:to-card" },
  { id: "tidy", scope: "family", title: "Ranger la maison", emoji: "🏠", price: 2000, duration: "45–60 min", description: "Le Buyer de la famille remet les espaces communs en ordre selon vos indications.", steps: ["Rassembler les objets déplacés", "Ranger les surfaces et espaces communs", "Laisser un passage propre et dégagé"], gradient: "from-emerald-100 via-green-50 to-white dark:from-emerald-950 dark:via-green-950/60 dark:to-card" },
  { id: "dishes", scope: "family", title: "Faire la vaisselle", emoji: "🍽️", price: 1000, duration: "25–40 min", description: "Le Buyer de la famille lave, rince et range la vaisselle utilisée par la famille.", steps: ["Trier et vider la vaisselle", "Laver puis rincer soigneusement", "Sécher ou ranger à sa place"], gradient: "from-blue-100 via-indigo-50 to-white dark:from-blue-950 dark:via-indigo-950/60 dark:to-card" },
  { id: "shopping", scope: "family", title: "Petite course urgente", emoji: "🛍️", price: 500, duration: "Selon la distance", description: "Le Buyer de la famille récupère rapidement un petit produit oublié à proximité. Le prix du produit reste séparé.", steps: ["Confirmer le produit exact", "Acheter au commerce disponible", "Remettre le produit et le ticket"], gradient: "from-violet-100 via-purple-50 to-white dark:from-violet-950 dark:via-purple-950/60 dark:to-card" },
  { id: "bathroom", scope: "family", title: "Nettoyer la salle de bain", emoji: "🛁", price: 1500, duration: "30–45 min", description: "Le Buyer de la famille nettoie les surfaces principales de la salle de bain familiale.", steps: ["Nettoyer lavabo et robinetterie", "Laver la douche ou baignoire", "Nettoyer le sol et laisser l’espace rangé"], gradient: "from-cyan-100 via-sky-50 to-white dark:from-cyan-950 dark:via-sky-950/60 dark:to-card" },
  { id: "kitchen", scope: "family", title: "Nettoyer la cuisine", emoji: "🧽", price: 1500, duration: "30–45 min", description: "Le Buyer de la famille nettoie les surfaces communes de la cuisine après utilisation.", steps: ["Essuyer le plan de travail", "Nettoyer évier et surfaces", "Passer le balai ou la serpillière"], gradient: "from-lime-100 via-emerald-50 to-white dark:from-lime-950 dark:via-emerald-950/60 dark:to-card" },
  { id: "family_custom", scope: "family", title: "Autre service familial", emoji: "✨", price: 200, duration: "À préciser", description: "Décrivez une autre tâche utile à toute la famille.", steps: ["Décrire clairement le besoin", "Choisir un prix entre 2 et 49 DH", "Le Buyer confirme puis réalise la tâche"], gradient: "from-amber-100 via-yellow-50 to-white dark:from-amber-950 dark:via-yellow-950/60 dark:to-card" },
  { id: "clean", scope: "personal", title: "Nettoyer ma chambre", emoji: "🧹", price: 1000, duration: "30–45 min", description: "Le Buyer de la famille range et nettoie simplement votre chambre selon vos instructions.", steps: ["Ranger les surfaces indiquées", "Balayer ou passer la serpillière", "Laisser la chambre propre et ordonnée"], gradient: "from-teal-100 via-emerald-50 to-white dark:from-teal-950 dark:via-emerald-950/60 dark:to-card" },
  { id: "website", scope: "personal", title: "Créer un petit site web", emoji: "💻", price: 4900, duration: "Sur devis", description: "Le Buyer de la famille prépare une petite page web personnelle à partir de votre texte et de vos images.", steps: ["Définir le but et le contenu", "Créer une page simple et adaptée au téléphone", "Livrer le lien ou les fichiers"], gradient: "from-indigo-100 via-violet-50 to-white dark:from-indigo-950 dark:via-violet-950/60 dark:to-card" },
  { id: "computer", scope: "personal", title: "Aide ordinateur ou téléphone", emoji: "🛠️", price: 1500, duration: "20–40 min", description: "Le Buyer de la famille vous aide pour un réglage, une installation ou un problème numérique simple.", steps: ["Identifier clairement le problème", "Effectuer le réglage ou expliquer la solution", "Vérifier que tout fonctionne"], gradient: "from-blue-100 via-sky-50 to-white dark:from-blue-950 dark:via-sky-950/60 dark:to-card" },
  { id: "documents", scope: "personal", title: "Préparer un document", emoji: "📄", price: 1000, duration: "20–35 min", description: "Le Buyer de la famille met en forme un document, un CV ou une petite présentation.", steps: ["Recevoir le texte et le format souhaité", "Mettre le contenu en page", "Livrer le fichier final"], gradient: "from-slate-100 via-blue-50 to-white dark:from-slate-900 dark:via-blue-950/60 dark:to-card" },
  { id: "errand", scope: "personal", title: "Petite course personnelle", emoji: "🏃", price: 800, duration: "Selon la distance", description: "Le Buyer de la famille réalise une petite course réservée à votre besoin personnel.", steps: ["Confirmer le lieu et le besoin", "Effectuer la course", "Remettre le résultat et le ticket si nécessaire"], gradient: "from-orange-100 via-rose-50 to-white dark:from-orange-950 dark:via-rose-950/60 dark:to-card" },
  { id: "homework", scope: "personal", title: "Aide aux devoirs", emoji: "📚", price: 1000, duration: "30–45 min", description: "Le Buyer de la famille vous accompagne sur un exercice ou une révision ciblée.", steps: ["Choisir la matière et l’objectif", "Expliquer la méthode pas à pas", "Vérifier la compréhension"], gradient: "from-yellow-100 via-orange-50 to-white dark:from-yellow-950 dark:via-orange-950/60 dark:to-card" },
  { id: "personal_custom", scope: "personal", title: "Autre service personnel", emoji: "⭐", price: 200, duration: "À préciser", description: "Décrivez un service uniquement pour vous.", steps: ["Décrire clairement le besoin", "Choisir un prix entre 2 et 49 DH", "Le Buyer confirme puis réalise la tâche"], gradient: "from-fuchsia-100 via-pink-50 to-white dark:from-fuchsia-950 dark:via-pink-950/60 dark:to-card" },
] as const;

export const SERVICE_CATALOG = Object.fromEntries(
  SERVICE_TEMPLATES.map((service) => [
    service.id,
    {
      price_cents: service.id.endsWith("_custom") ? null : service.price,
      scope: service.scope,
    },
  ]),
) as Record<string, { price_cents: number | null; scope: ServiceScope }>;
