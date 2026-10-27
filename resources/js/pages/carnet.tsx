/* eslint-disable */
// @ts-nocheck
import { usePage } from '@inertiajs/react';
import SessionMenu from '@/components/session-menu';
import React, { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   CARNET DE FERME — LA FERME D'TOMATE                version 5.6
   SADC SUPPLY CONGO SARL — succursale D'Tomate
   Ntetema, Route Kinsevere, Haut-Katanga, RDC
   Propriétaire : M. Christophe LOSEMBE
   ───────────────────────────────────────────────────────────────
   Nouveautés v3 : photos, mesures, présence nominative, vue semaine,
   export CSV, stock, coûts et rendements, lots et traçabilité,
   suivi des régimes de bananes.
   ───────────────────────────────────────────────────────────────
   SÉCURITÉ : le double code signe les saisies et coupe l'accès d'un
   agent parti. Ce n'est PAS une authentification d'entreprise.
   Pour la MFA sur les comptes @sadcis.co.za : héberger derrière le
   SSO Microsoft Entra ID.
   ═══════════════════════════════════════════════════════════════ */

const APP_VERSION = "5.6";
/* Le schéma de données ne change JAMAIS de nom de clé entre deux versions.
   Toute version ultérieure doit lire les clés existantes, jamais les écraser :
   les seeds ne s'appliquent qu'aux clés absentes, et les catalogues se
   complètent par fusion. C'est ce qui permet de mettre à jour l'application
   sans perdre une seule journée de carnet. */
const SCHEMA = 3;
const APP_DATE = "17 septembre 2026";
const HISTORIQUE_VERSIONS = [
  ["5.6", "Intégration du socle : import des sauvegardes, diagnostic, protection des registres et corrections du stock et du pointage. Accès authentifié et espace profil avec changement de mot de passe."],
  ["5.3", "Conservation des données entre versions : fusion non destructive des catalogues, archivage mensuel du journal et des mouvements au lieu de leur troncature, sauvegarde et restauration intégrales en JSON."],
  ["5.2", "Export CSV sur une période, sauvegarde complète en un fichier, téléchargement fiabilisé avec repli en copier-coller si le navigateur le bloque."],
  ["5.1", "Numéro de version affiché partout. Alertes de stock recalculées en direct et déplacées dans un registre dédié : seuls les articles réellement mouvementés déclenchent une alerte."],
  ["5.0", "Réquisitions avec délégation d'autorité, centres de coûts, création d'article, sortie manuelle, comptage physique, contrôle permanent du calendrier, envois e-mail au supérieur et à la Direction."],
  ["4.0", "Poulailler (aliment, ponte, cheptel, santé). Listes d'intrants, de tâches et d'unités adaptées à chaque spéculation. Plans et calendriers consultables. Saisie libre du nom d'un journalier."],
  ["3.0", "Photos, mesures, présence nominative, vue semaine, export CSV, stock, coûts et rendements, lots et traçabilité, suivi des régimes."],
  ["2.0", "Double code d'accès, journal d'activité, mélanges de produits, registre des cultures, moteur de tâches par âge."],
  ["1.0", "Carnet journalier : travaux, engrais, phyto, récolte, gainage, livraisons, problèmes, rapport."],
];

const EMAIL_DIRECTION = "c.losembe@sadcis.co.za";
const ENTITE = "LA FERME D'TOMATE — SADC SUPPLY CONGO SARL";
const SITE = "Ntetema, Route Kinsevere, Haut-Katanga";
const CODE_SITE_DEFAUT = "2026";
const DEVISE = "USD";

/* Effectif D'TOMATES actif — registre de paie de juillet 2026.
   Le taux journalier vient de la colonne SALAIRE BASE JOURNALIER. */
const EQUIPE = [
  { nom: "Christophe LOSEMBE — Direction", taux: 0 },
  { nom: "MANDE DJUBA, Nowedi — superviseur", taux: 15.91 },
  { nom: "SHAMBUYI, Remond — tout travaux", taux: 5.77 },
  { nom: "LUKWESA, Etienne — tout travaux", taux: 3.85 },
  { nom: "KABONDO MWAMBA, Alphonse — tout travaux", taux: 3.85 },
  { nom: "MUJINGA KASEYA, Demuzi — tout travaux", taux: 3.85 },
];
const AGENTS = EQUIPE.map((e) => e.nom);
const tauxDe = (n) => (EQUIPE.find((e) => e.nom === n) || { taux: 3.85 }).taux;
const estDirection = (a) => (a || "").startsWith("Christophe LOSEMBE");
const STATUTS_PRESENCE = ["Présent", "Absent", "Congé", "Maladie", "Repos"];

/* ═══════════ ZONES ═══════════ */
const ZONES = {
  TOM: ["Module 1", "Module 2", "Module 3", "Module 4", "Module 5", "Pépinière tomate"],
  BAN: ["Parc 1", "Parc 2", "Parc 3", "Pépinière PIF"],
  AVI: ["Poulailler 1", "Poulailler 2", "Poussinière"],
};
const HORS_CULTURE = ["Local fertigation / cuves", "Magasin", "Station de pompage", "Aire de conditionnement"];
const LIEUX_LIV = ["Magasin", "Aire de conditionnement", "Véhicule de livraison", "Client — Top Market"];

/* ═══════════ ORGANISATION, DÉLÉGATION D'AUTORITÉ, CENTRES DE COÛTS ═══════════
   Les plafonds ci-dessous sont une proposition de départ. La Direction les
   ajuste dans Registres → Accès. Un plafond dépassé remonte automatiquement
   à l'échelon supérieur : personne ne peut engager au-delà de sa délégation. */
const HIERARCHIE = {
  "Christophe LOSEMBE — Direction": { role: "Direction", superieur: "", plafond: 999999 },
  "MANDE DJUBA, Nowedi — superviseur": { role: "Superviseur", superieur: "Christophe LOSEMBE — Direction", plafond: 200 },
  "SHAMBUYI, Remond — tout travaux": { role: "Agent", superieur: "MANDE DJUBA, Nowedi — superviseur", plafond: 0 },
  "LUKWESA, Etienne — tout travaux": { role: "Agent", superieur: "MANDE DJUBA, Nowedi — superviseur", plafond: 0 },
  "KABONDO MWAMBA, Alphonse — tout travaux": { role: "Agent", superieur: "MANDE DJUBA, Nowedi — superviseur", plafond: 0 },
  "MUJINGA KASEYA, Demuzi — tout travaux": { role: "Agent", superieur: "MANDE DJUBA, Nowedi — superviseur", plafond: 0 },
};
const EMAILS_DEFAUT = { "Christophe LOSEMBE — Direction": EMAIL_DIRECTION };

const CENTRES = [
  { code: "CC-SER", nom: "Serre — tomate", bureau: "TOM" },
  { code: "CC-BAN", nom: "Bananeraie", bureau: "BAN" },
  { code: "CC-AVI", nom: "Poulailler", bureau: "AVI" },
  { code: "CC-MAG", nom: "Magasin, conditionnement et logistique", bureau: "LIV" },
  { code: "CC-GEN", nom: "Frais généraux du site", bureau: "*" },
];
const centreDeZone = (z) => {
  if (!z) return "CC-GEN";
  if (ZONES.TOM.indexOf(z) >= 0) return "CC-SER";
  if (ZONES.BAN.indexOf(z) >= 0) return "CC-BAN";
  if (ZONES.AVI.indexOf(z) >= 0) return "CC-AVI";
  if (["Magasin", "Aire de conditionnement", "Véhicule de livraison", "Client — Top Market"].indexOf(z) >= 0) return "CC-MAG";
  if (z === "Local fertigation / cuves") return "CC-SER";
  return "CC-GEN";
};
const nomCentre = (c) => { const x = CENTRES.find((y) => y.code === c); return x ? x.nom : c; };

const TYPES_DEMANDE = [
  "Sortie de stock", "Achat / réapprovisionnement", "Demande de caisse",
  "Création d'un nouvel article", "Réparation / intervention", "Autre besoin",
];
const URGENCES = ["Normale — sous 7 jours", "Pressée — sous 48 h", "Bloquante — le travail est arrêté"];
const STATUTS_DEMANDE = ["À valider", "Validée", "Refusée", "Servie", "Clôturée"];
const MOTIFS_REFUS = ["Stock déjà disponible", "Budget insuffisant", "Non prioritaire",
  "Quantité excessive", "Spécification à revoir", "Autre"];


/* ═══════════ CATALOGUE ARTICLES (référentiel unique produits/stock) ═══════════
   Sources : LISTE_ACHATS_TOMATE, LISTE_ACHATS_BANANE, calendriers d'actions.
   prix = 0 tant que la Direction ne l'a pas renseigné dans l'onglet Stock.     */
const ARTICLES_INITIAUX = [
  /* engrais */
  ["ENG01", "Nitrate de calcium — Ca(NO₃)₂", "Engrais", "kg", 50], ["ENG02", "Multi-K — KNO₃ 13-0-46", "Engrais", "kg", 50],
  ["ENG03", "MAP 12-61-0 soluble", "Engrais", "kg", 25], ["ENG04", "Sulfate de potassium — K₂SO₄", "Engrais", "kg", 50],
  ["ENG05", "Sulfate de magnésium — MgSO₄", "Engrais", "kg", 25], ["ENG06", "Urée 46% N", "Engrais", "kg", 100],
  ["ENG07", "Sulfate d'ammonium 21-0-0+24S", "Engrais", "kg", 50], ["ENG08", "MOP / KCl 60% K₂O", "Engrais", "kg", 50],
  ["ENG09", "NPK 20-20-20 soluble", "Engrais", "kg", 10], ["ENG10", "Chlorure de calcium — CaCl₂", "Engrais", "kg", 10],
  ["ENG11", "Acide borique", "Engrais", "kg", 5], ["ENG12", "Dolomie", "Engrais", "kg", 100],
  ["ENG13", "Acide phosphorique", "Engrais", "L", 10], ["ENG14", "Cendre de bois", "Engrais", "kg", 0],
  ["ENG15", "Compost / fumier décomposé", "Engrais", "kg", 500], ["ENG16", "Tourteau de neem", "Engrais", "kg", 50],
  /* phyto */
  ["PHY01", "Mancozèbe — Dithane M-45 (FRAC M03)", "Phyto", "kg", 10],
  ["PHY02", "Chlorothalonil (FRAC M05)", "Phyto", "L", 5],
  ["PHY03", "Cuivre oxychlorure (FRAC M01)", "Phyto", "kg", 5],
  ["PHY04", "Soufre mouillable (FRAC M02)", "Phyto", "kg", 5],
  ["PHY05", "Propiconazole — Tilt 250 EC (FRAC 3)", "Phyto", "L", 3],
  ["PHY06", "Difénoconazole — Score 250 EC (FRAC 3)", "Phyto", "L", 2],
  ["PHY07", "Azoxystrobine — Amistar (FRAC 11)", "Phyto", "L", 2],
  ["PHY08", "Boscalid + pyraclostrobine (FRAC 7+11)", "Phyto", "L", 2],
  ["PHY09", "Iprodione (FRAC 2)", "Phyto", "L", 2],
  ["PHY10", "Fenhexamid (FRAC 17)", "Phyto", "L", 2],
  ["PHY11", "Métalaxyl — Ridomil Gold MZ (FRAC 4)", "Phyto", "kg", 3],
  ["PHY12", "Imidaclopride — Confidor 200 SL (IRAC 4A)", "Phyto", "L", 2],
  ["PHY13", "Acétamipride (IRAC 4A)", "Phyto", "kg", 1],
  ["PHY14", "Spinosad (IRAC 5)", "Phyto", "L", 2],
  ["PHY15", "Abamectine (IRAC 6)", "Phyto", "L", 2],
  ["PHY16", "Lambda-cyhalothrine — Karate 2.5 EC (IRAC 3A)", "Phyto", "L", 2],
  ["PHY17", "Indoxacarbe (IRAC 22A)", "Phyto", "L", 1],
  ["PHY18", "Carbofuran — Furadan 5G (IRAC 1A)", "Phyto", "kg", 10],
  /* post-récolte */
  ["PRC01", "Alun", "Post-récolte", "kg", 10], ["PRC02", "Eau de Javel 5%", "Post-récolte", "L", 20],
  ["PRC03", "Mertect 500 SC — TBZ", "Post-récolte", "L", 1],
  /* emballage et fournitures */
  ["EMB01", "Sac PE perforé BLEU 80×100", "Emballage", "unité", 200],
  ["EMB02", "Caisse plastique 15 kg", "Emballage", "unité", 50],
  ["EMB03", "Ficelle de palissage", "Fourniture", "rouleau", 5],
  ["EMB04", "Tuteur bambou 3 m", "Fourniture", "unité", 50],
  ["EMB05", "Ruban de marquage régimes", "Fourniture", "rouleau", 6],
  ["ALI01", "Aliment DÉMARRAGE poussin — 21% PB", "Aliment", "kg", 100],
  ["ALI02", "Aliment CROISSANCE poulet — 19% PB", "Aliment", "kg", 100],
  ["ALI03", "Aliment FINITION poulet — 18% PB", "Aliment", "kg", 100],
  ["ALI04", "Aliment POULETTE — 16% PB", "Aliment", "kg", 100],
  ["ALI05", "Aliment PONTE — 17% PB, 4% Ca", "Aliment", "kg", 150],
  ["ALI06", "Coquilles d'huître / calcaire concassé", "Aliment", "kg", 25],
  ["ALI07", "Premix vitamines et minéraux", "Aliment", "kg", 5],
  ["ALI08", "Copeaux de bois — litière", "Aliment", "sac", 20],
  ["VET01", "Vaccin Newcastle + Bronchite", "Vétérinaire", "dose", 500],
  ["VET02", "Vaccin Gumboro", "Vétérinaire", "dose", 500],
  ["VET03", "Anticoccidien", "Vétérinaire", "L", 1],
  ["VET04", "Vermifuge volaille", "Vétérinaire", "L", 1],
  ["VET05", "Vitamines / anti-stress soluble", "Vétérinaire", "kg", 2],
  ["VET06", "Désinfectant bâtiment", "Vétérinaire", "L", 5],
  ["DIV01", "Carburant pompe", "Divers", "L", 100],
].map(([id, nom, cat, unite, seuil]) => ({ id, nom, cat, unite, seuil, prix: 0, stock: 0, peremption: "" }));

const CAT_ARTICLES = ["Engrais", "Phyto", "Aliment", "Vétérinaire", "Post-récolte", "Emballage", "Fourniture", "Divers"];
const BACS = ["Bac A", "Bac B", "Épandage au sol", "Pulvérisation foliaire"];
const CALCIQUES = ["Nitrate de calcium", "Chlorure de calcium"];
const ANTAGONISTES = ["Sulfate", "MAP", "Acide phosphorique", "Dolomie"];

/* ═══════════ MESURES ═══════════ */
const MESURES = [
  { id: "ec", nom: "EC de la solution", unite: "mS/cm", min: 1.6, max: 2.5, bureau: "TOM",
    aide: "Mesurer dans le goutteur, pas dans le bac. 1,6–2,0 en croissance, 2,2–2,5 en récolte." },
  { id: "ph", nom: "pH de la solution", unite: "", min: 5.8, max: 6.2, bureau: "TOM",
    aide: "Corriger à l'acide phosphorique si trop haut." },
  { id: "tmax", nom: "Température maximale", unite: "°C", min: 18, max: 30, bureau: "TOM",
    aide: "Au-dessus de 30 °C la pollinisation échoue : ventiler et ombrer." },
  { id: "tmin", nom: "Température minimale", unite: "°C", min: 14, max: 22, bureau: "TOM" },
  { id: "tens15", nom: "Tensiomètre 15 cm", unite: "kPa", min: -25, max: -15, bureau: "TOM",
    aide: "Valeur négative. Sous −25 : le sol sèche, arroser." },
  { id: "tens30", nom: "Tensiomètre 30 cm", unite: "kPa", min: -25, max: -15, bureau: "TOM" },
  { id: "pression", nom: "Pression du réseau", unite: "bar", min: 1.2, max: 1.8, bureau: "*",
    aide: "Mesurer en bout de ligne, pas à la pompe." },
  { id: "pluie", nom: "Pluviométrie", unite: "mm", min: 0, max: 999, bureau: "*",
    aide: "Au-dessus de 15 mm : pas d'irrigation ce jour sur la bananeraie." },
  { id: "debit", nom: "Débit de la pompe", unite: "m³/h", min: 0, max: 999, bureau: "*" },
  { id: "tbat", nom: "Température du bâtiment", unite: "°C", min: 20, max: 33, bureau: "AVI",
    aide: "33 °C la 1re semaine, puis −3 °C par semaine jusqu'à 22 °C. Mesurer à hauteur de poussin, pas au plafond." },
  { id: "hbat", nom: "Humidité du bâtiment", unite: "%", min: 50, max: 70, bureau: "AVI",
    aide: "Trop sec : poussière et problèmes respiratoires. Trop humide : litière croûtée et ammoniac." },
  { id: "eauCons", nom: "Eau consommée", unite: "L", min: 0, max: 9999, bureau: "AVI",
    aide: "Une chute brutale de consommation d'eau précède de 24 h tout problème sanitaire. C'est le meilleur signal d'alerte." },
];

/* ═══════════ TÂCHES PAR CULTURE ═══════════ */
const T_TOMATE = [
  { id: "tour", nom: "Tour de serre", freq: "jour", cat: "Contrôle",
    detail: "Vérifier la reprise des plants, la température et la ventilation. Au-dessus de 28 °C : ouvrir la ventilation et déployer l'ombrière." },
  { id: "ombrage", nom: "Ombrage des 3 premiers jours", freq: "jour", min: 0, max: 3, cat: "Contrôle",
    detail: "Ombrage 50 % sur les plants fraîchement repiqués." },
  { id: "ficelles", nom: "Fixation des ficelles de palissage", freq: "unique", min: 3, max: 12, cat: "Conduite",
    detail: "Une ficelle par tige. Nœud lâche au collet, jamais serré." },
  { id: "fertA", nom: "Fertigation — lundi", freq: "sem", jour: 1, min: 1, max: 49, cat: "Fertigation",
    detail: "Bac A : Ca(NO₃)₂ 4,2 kg + KNO₃ 5,5 kg / 200 L. Bac B : MAP 2,4 kg + MgSO₄ 1,2 kg / 200 L. EC 1,6–2,0, pH 5,8–6,2. NE JAMAIS mélanger A et B." },
  { id: "fertA2", nom: "Fertigation — jeudi", freq: "sem", jour: 4, min: 1, max: 49, cat: "Fertigation",
    detail: "Même préparation que le lundi. Deuxième injection de la semaine." },
  { id: "fertB", nom: "Fertigation — lundi (floraison)", freq: "sem", jour: 1, min: 50, max: 91, cat: "Fertigation",
    detail: "Bac A : Ca(NO₃)₂ 8,5 kg + KNO₃ 8 kg / 300 L. Bac B : MAP 2,5 kg + MgSO₄ 3,5 kg / 300 L. EC 2,0–2,3. Doses doublées." },
  { id: "fertB2", nom: "Fertigation — jeudi (floraison)", freq: "sem", jour: 4, min: 50, max: 91, cat: "Fertigation",
    detail: "Même préparation que le lundi." },
  { id: "fertC", nom: "Fertigation — lundi (récolte)", freq: "sem", jour: 1, min: 92, cat: "Fertigation",
    detail: "Bac A : Ca(NO₃)₂ 7 kg + KNO₃ 12 kg / 300 L. Bac B : MAP 2,5 kg + K₂SO₄ 4 kg + MgSO₄ 2 kg / 300 L. EC 2,2–2,5. Le potassium remplit les fruits." },
  { id: "fertC2", nom: "Fertigation — jeudi (récolte)", freq: "sem", jour: 4, min: 92, cat: "Fertigation",
    detail: "Même préparation que le lundi." },
  { id: "taille", nom: "Taille — retirer les gourmands", freq: "sem", jour: 2, min: 7, cat: "Conduite",
    detail: "Retirer tous les gourmands sauf la 2e tige. Désinfecter le sécateur à l'alcool 70 % entre chaque plant." },
  { id: "effeuil", nom: "Effeuillage bas", freq: "sem", jour: 2, min: 50, cat: "Conduite",
    detail: "Enlever 2 à 3 feuilles sous le dernier bouquet récolté. L'air circule, le Botrytis recule." },
  { id: "baisser", nom: "Baisser et pencher les plants", freq: "sem", jour: 2, min: 60, cat: "Conduite",
    detail: "Descendre les tiges le long de la ficelle pour garder la tête à hauteur de travail." },
  { id: "irrM", nom: "Irrigation eau claire — mercredi", freq: "sem", jour: 3, min: 1, cat: "Irrigation",
    detail: "Eau claire, pas de fertigation. 2–4 L/plant jusqu'à J49, 4–6 L en floraison, 6–8 L en récolte." },
  { id: "irrS", nom: "Irrigation eau claire — samedi", freq: "sem", jour: 6, min: 1, cat: "Irrigation",
    detail: "Eau claire. Relever les data loggers." },
  { id: "irrD", nom: "Irrigation eau claire — dimanche", freq: "sem", jour: 0, min: 1, cat: "Irrigation",
    detail: "Eau claire. Ne pas arroser après 14 h en saison des pluies." },
  { id: "scout", nom: "Scouting — vendredi matin", freq: "sem", jour: 5, min: 7, cat: "Surveillance",
    detail: "50 plants par module, dessous des feuilles. Relever les pièges jaunes. Plus de 10 aleurodes par piège : traiter." },
  { id: "fongi", nom: "Pulvérisation fongicide — vendredi soir", freq: "sem", jour: 5, min: 7, cat: "Phyto",
    detail: "Semaine impaire : chlorothalonil 2 g/L (FRAC M5). Semaine paire : azoxystrobine 0,8 mL/L + difénoconazole 0,5 mL/L (FRAC 11+3). EPI obligatoires, délai de rentrée 24 h. En récolte, vérifier le DAR." },
  { id: "foliCa", nom: "Foliaire calcium", freq: "periode", periode: 14, min: 7, max: 49, cat: "Fertigation",
    detail: "CaCl₂ 5 g/L. Prévention de la nécrose apicale (cul noir)." },
  { id: "foliCaB", nom: "Foliaire calcium + bore", freq: "sem", jour: 5, min: 50, cat: "Fertigation",
    detail: "CaCl₂ 5 g/L + acide borique 1 g/L, chaque semaine. Le bore sert la pollinisation." },
  { id: "recL", nom: "Récolte — lundi 6 h à 9 h", freq: "sem", jour: 1, min: 80, cat: "Récolte",
    detail: "Stade breaker. Mains propres, pas de bagues. Caisses de 2 couches maximum. Ne pas récolter après 9 h." },
  { id: "recMe", nom: "Récolte — mercredi 6 h", freq: "sem", jour: 3, min: 80, cat: "Récolte",
    detail: "Deuxième récolte de la semaine." },
  { id: "tri", nom: "Tri de la récolte", freq: "sem", jour: 2, min: 80, cat: "Récolte",
    detail: "Trier la récolte du lundi. Grade A premium, B marché local, C écarté." },
  { id: "goutteurs", nom: "Contrôle des goutteurs", freq: "sem", jour: 3, min: 1, cat: "Contrôle",
    detail: "Parcourir les lignes, repérer les goutteurs bouchés et les fuites. Pression 1,2–1,8 bar." },
  { id: "rincage", nom: "Rinçage acide du Mazzei", freq: "periode", periode: 28, min: 100, cat: "Entretien",
    detail: "Acide phosphorique 0,5 %. Débouche les goutteurs. Rincer ensuite à l'eau claire 30 min." },
  { id: "finCycle", nom: "Fin de cycle — réduire l'azote", freq: "periode", periode: 14, min: 175, cat: "Conduite",
    detail: "Sous 200 kg par semaine : réduire la fertigation, cuivre seul, arrêter la chimie 7 jours avant la dernière récolte, puis arracher et désinfecter." },
];

const T_PEPI_TOM = [
  { id: "arros", nom: "Arrosage en pulvérisation fine", freq: "jour", min: 0, max: 20, cat: "Irrigation",
    detail: "Eau propre. Substrat humide, jamais trempé. Germination en 6 à 10 jours." },
  { id: "drench", nom: "Drench fongicide du substrat", freq: "unique", min: 0, max: 2, cat: "Phyto",
    detail: "Ridomil Gold MZ 2,5 g/L. Arroser chaque plaque. Prévient la fonte des semis." },
  { id: "fert1", nom: "Fertilisation pépinière", freq: "periode", periode: 7, min: 7, max: 13, cat: "Fertigation",
    detail: "NPK 20-20-20 à 0,5 g/L." },
  { id: "fert2", nom: "Fertilisation pépinière — dose doublée", freq: "periode", periode: 7, min: 14, max: 34, cat: "Fertigation",
    detail: "NPK 20-20-20 à 1 g/L." },
  { id: "manco", nom: "Pulvérisation mancozèbe", freq: "periode", periode: 7, min: 7, max: 27, cat: "Phyto",
    detail: "Mancozèbe 2 g/L sur les feuilles. À J7, J14, J21 puis STOP à J28 : une semaine propre avant repiquage." },
  { id: "confidor", nom: "Drench insecticide préventif", freq: "unique", min: 21, max: 24, cat: "Phyto",
    detail: "Confidor 0,5 mL/L, environ 30 mL par cellule au pied. Protège des aleurodes 3 à 4 semaines après repiquage." },
  { id: "durcis", nom: "Durcissement progressif", freq: "jour", min: 21, max: 34, cat: "Conduite",
    detail: "Réduire l'eau, exposer au soleil direct 2 à 4 h par jour puis toute la journée." },
  { id: "pret", nom: "Contrôle : les plants sont-ils prêts ?", freq: "unique", min: 33, max: 45, cat: "Contrôle",
    detail: "Prêt si 4 à 6 vraies feuilles, 15 à 25 cm, vert foncé, tige solide. Jeter tout plant jaune ou malade." },
];

const T_BANANE = [
  { id: "pediluve", nom: "Pédiluve et désinfection des outils", freq: "jour", cat: "Biosécurité",
    detail: "Tremper les pieds à chaque entrée du parc. Javel 10 %, renouvelée chaque semaine. Machettes et sécateurs désinfectés avant et après chaque usage." },
  { id: "irr", nom: "Irrigation", freq: "jour", cat: "Irrigation",
    detail: "M1–M3 : 25–35 L/plant/jour. M4–M6 : 35–45 L. M7 et au-delà : 45–55 L. Pluie supérieure à 15 mm : pas d'irrigation." },
  { id: "fert1", nom: "Fertilisation mensuelle — établissement", freq: "periode", periode: 30, min: 25, max: 100, cat: "Fertilisation",
    detail: "Urée 40 g + K₂SO₄ 65 g par plant, en cercle à 30 cm du pseudotronc. Jamais contre le pseudotronc." },
  { id: "fert2", nom: "Fertilisation mensuelle — croissance", freq: "periode", periode: 30, min: 101, max: 190, cat: "Fertilisation",
    detail: "Urée 65 g + K₂SO₄ 130 g + MgSO₄ 30 g par plant, en cercle à 30–50 cm." },
  { id: "fert3", nom: "Fertilisation mensuelle — pré-floraison", freq: "periode", periode: 30, min: 191, max: 280, cat: "Fertilisation",
    detail: "Urée 100 g + K₂SO₄ 250 g par plant, en cercle à 50 cm. Pic de potassium." },
  { id: "fert4", nom: "Fertilisation mensuelle — remplissage", freq: "periode", periode: 30, min: 281, cat: "Fertilisation",
    detail: "Urée 70 g + K₂SO₄ 250 g par plant, en cercle à 50 cm." },
  { id: "desherb", nom: "Désherbage manuel", freq: "periode", periode: 15, min: 20, cat: "Entretien",
    detail: "Manuel autour de chaque plant, rayon 1 m." },
  { id: "paillage", nom: "Contrôle du paillage", freq: "periode", periode: 30, min: 20, cat: "Entretien",
    detail: "Recharger si l'épaisseur est inférieure à 10 cm. Le paillis ne doit jamais toucher le pseudotronc." },
  { id: "pieges", nom: "Relever les pièges à charançon", freq: "periode", periode: 15, min: 30, cat: "Surveillance",
    detail: "Tronçons de pseudotronc de 30 cm, face coupée au sol, 1 piège pour 10 mats. Retourner et détruire les charançons." },
  { id: "nema1", nom: "Nématicide — 1re application", freq: "unique", min: 55, max: 75, cat: "Phyto",
    detail: "Carbofuran 20 g au pied de chaque plant. TOXIQUE : gants, masque, combinaison, bottes. Maximum 2 fois par an." },
  { id: "nema2", nom: "Nématicide — 2e application", freq: "unique", min: 115, max: 135, cat: "Phyto",
    detail: "Carbofuran 20 g par plant. EPI complets. Dernière de l'année." },
  { id: "effeuil", nom: "Effeuillage sanitaire Sigatoka", freq: "periode", periode: 15, min: 100, cat: "Phyto",
    detail: "Couper toute feuille tachée et la poser en paillis loin du mat. Garder 8 à 10 feuilles saines minimum." },
  { id: "oeillet", nom: "Œilletonnage", freq: "periode", periode: 24, min: 100, cat: "Conduite",
    detail: "Garder Mère + Fille + Petite-fille. Couper tous les autres rejets et enfoncer la machette en croix dans le corme coupé." },
  { id: "sigatoka", nom: "Fongicide Sigatoka", freq: "periode", periode: 24, min: 30, cat: "Phyto",
    detail: "Rotation obligatoire : mancozèbe 2,5 g/L (M03) → propiconazole 1 mL/L (3) → azoxystrobine 1 mL/L + difénoconazole 0,5 mL/L (11+3) → mancozèbe. Azoxystrobine 3 fois par an maximum. Jamais plus de 28 jours entre deux passages." },
  { id: "foliKCa", nom: "Foliaire potassium + calcium", freq: "periode", periode: 15, min: 191, cat: "Fertilisation",
    detail: "K₂SO₄ 15 g/L + CaCl₂ 5 g/L en pulvérisation foliaire." },
  { id: "declochage", nom: "Déclochage — casser la fleur mâle", freq: "periode", periode: 7, min: 280, cat: "Conduite",
    detail: "10 à 15 jours après la dernière main femelle, casser la cloche À LA MAIN. Jamais d'outil." },
  { id: "ensachage", nom: "Ensachage des régimes", freq: "periode", periode: 7, min: 285, cat: "Conduite",
    detail: "7 à 10 jours après le déclochage. Sac polyéthylène PERFORÉ BLEU 80×100 cm. Poser le ruban de la semaine. Gain de poids de 10 à 15 %." },
  { id: "tuteurage", nom: "Tuteurage des mats en fruit", freq: "periode", periode: 7, min: 280, cat: "Conduite",
    detail: "Dès que le régime est visible : tuteur bambou de 3 m attaché au pseudotronc. Un tuteur par mat en fruit." },
  { id: "arretChimie", nom: "Arrêt de la chimie avant récolte", freq: "unique", min: 330, max: 360, cat: "Phyto",
    detail: "14 jours avant la coupe : plus de fongicide foliaire, plus de nématicide." },
  { id: "maturite", nom: "Contrôle de maturité des régimes", freq: "periode", periode: 7, min: 330, cat: "Récolte",
    detail: "Doigts aux trois quarts arrondis, diamètre 35 à 48 mm, vert foncé uniforme, 80 à 100 jours après floraison." },
  { id: "postrecolte", nom: "Chaîne post-récolte", freq: "periode", periode: 7, min: 340, cat: "Récolte",
    detail: "Bain 1 alun 20 g/L 15–20 min. Bain 2 Javel 4 mL/L (200 ppm) 2–3 min. Bain 3 Mertect 1 mL/L sur les couronnes. Sans le bain 3, les bananes pourrissent en 3 à 5 jours." },
];

const T_PIF = [
  { id: "arros", nom: "Arrosage du germoir", freq: "jour", cat: "Irrigation",
    detail: "Au pulvérisateur, une fois le matin. Jamais au jet." },
  { id: "test", nom: "Test de la poignée de sciure", freq: "jour", cat: "Contrôle",
    detail: "Serrer une poignée : l'eau coule, trop mouillé ; boule humide, parfait ; s'émiette, arroser un peu." },
  { id: "pourris", nom: "Retirer les cormes pourris", freq: "jour", cat: "Biosécurité",
    detail: "Mou, noir, odeur : retirer immédiatement du germoir." },
  { id: "comptage", nom: "Comptage des plantules sorties", freq: "periode", periode: 7, min: 14, max: 45, cat: "Contrôle",
    detail: "Bourgeons blancs en semaine 2–3, pousses vertes en semaine 3–4, 2 à 3 feuilles en semaine 5–6." },
  { id: "sevrage", nom: "Sevrage en pots", freq: "unique", min: 35, max: 55, cat: "Conduite",
    detail: "Dès 2 à 3 feuilles. Terreau 3 terre + 2 sable + 1 fumier. Une plantule par pot. Remettre le corme au germoir." },
  { id: "endurc", nom: "Endurcissement", freq: "jour", min: 84, max: 98, cat: "Conduite",
    detail: "Plein soleil et arrosage un jour sur deux pendant les deux dernières semaines." },
  { id: "pret", nom: "Contrôle : plants prêts à transplanter", freq: "unique", min: 98, max: 120, cat: "Contrôle",
    detail: "25 à 40 cm, 4 à 6 feuilles saines, base d'au moins 1,5 cm, racines blanches. Un plant jaune ne va pas au champ." },
];

/* ═══════════ AVICULTURE ═══════════
   ATTENTION : aucun plan d'exploitation avicole ne figure au dossier du
   projet. Les âges, les aliments et les normes ci-dessous sont les
   références techniques standard pour la volaille commerciale.
   ILS DOIVENT ÊTRE VALIDÉS PAR LA DIRECTION avant d'être opposables à
   l'équipe, et remplacés dès qu'un PLAN-AVICOLE-001 existera.          */
const AVI_A_VALIDER = true;

const T_CHAIR = [
  { id: "eauChair", nom: "Eau — abreuvoirs propres et pleins", freq: "jour", cat: "Alimentation",
    detail: "Nettoyer les abreuvoirs chaque matin. Un poulet boit environ deux fois ce qu'il mange. Eau tiède la première semaine." },
  { id: "alimDem", nom: "Aliment DÉMARRAGE", freq: "jour", min: 0, max: 10, cat: "Alimentation",
    detail: "Aliment démarrage poussin (21–22 % de protéines), en miettes. À volonté. Comptez 15 à 20 g par sujet et par jour la première semaine." },
  { id: "alimCro", nom: "Aliment CROISSANCE", freq: "jour", min: 11, max: 24, cat: "Alimentation",
    detail: "Aliment croissance (19–20 % de protéines). Transition progressive sur 3 jours en mélangeant les deux aliments : un changement brutal provoque des diarrhées." },
  { id: "alimFin", nom: "Aliment FINITION", freq: "jour", min: 25, cat: "Alimentation",
    detail: "Aliment finition (18 % de protéines). Respecter le délai d'attente des additifs avant abattage." },
  { id: "temp", nom: "Contrôle de la température", freq: "jour", min: 0, max: 28, cat: "Ambiance",
    detail: "33 °C la 1re semaine, puis −3 °C par semaine jusqu'à 22 °C. Poussins entassés : trop froid. Poussins écartés le long des murs : trop chaud." },
  { id: "litiere", nom: "Contrôle de la litière", freq: "jour", cat: "Ambiance",
    detail: "Litière sèche et meuble. Une croûte humide brûle les pattes et déclenche l'ammoniac. Retourner, et remplacer les zones mouillées." },
  { id: "mortalite", nom: "Ramassage des morts et comptage", freq: "jour", cat: "Santé",
    detail: "Ramasser matin et soir. Noter le nombre. Au-delà de 1 % en un jour, prévenir la Direction immédiatement." },
  { id: "vacND1", nom: "Vaccination Newcastle + Bronchite", freq: "unique", min: 6, max: 9, cat: "Santé",
    detail: "Premier rappel, à l'eau de boisson. Retirer l'eau 2 heures avant. Pas de désinfectant dans l'eau ce jour-là." },
  { id: "vacGum", nom: "Vaccination Gumboro", freq: "unique", min: 12, max: 16, cat: "Santé",
    detail: "À l'eau de boisson. Même précaution : pas de chlore ni de désinfectant dans l'eau." },
  { id: "vacND2", nom: "Rappel Newcastle", freq: "unique", min: 20, max: 24, cat: "Santé",
    detail: "Deuxième rappel à l'eau de boisson." },
  { id: "pesee", nom: "Pesée d'un échantillon", freq: "periode", periode: 7, min: 7, cat: "Contrôle",
    detail: "Peser 20 sujets pris au hasard. Objectifs indicatifs : 180 g à J7, 500 g à J14, 1 000 g à J21, 1 600 g à J28, 2 400 g à J42." },
  { id: "densite", nom: "Contrôle de la densité et du matériel", freq: "periode", periode: 7, cat: "Ambiance",
    detail: "10 à 12 sujets par m². Une mangeoire pour 50 sujets, un abreuvoir pour 80. En manque, les plus faibles ne mangent pas." },
  { id: "biosec", nom: "Biosécurité — pédiluve et interdiction d'entrée", freq: "jour", cat: "Biosécurité",
    detail: "Pédiluve à l'entrée, renouvelé chaque semaine. Aucun visiteur. Ne jamais aller au poulailler après avoir visité un autre élevage." },
  { id: "vide", nom: "Vide sanitaire à préparer", freq: "unique", min: 40, max: 50, cat: "Biosécurité",
    detail: "Après enlèvement : sortir la litière, laver, désinfecter, laisser le bâtiment vide 14 jours minimum avant la bande suivante." },
];

const T_PONDEUSE = [
  { id: "eauP", nom: "Eau — abreuvoirs propres et pleins", freq: "jour", cat: "Alimentation",
    detail: "Nettoyer chaque matin. Une pondeuse boit 200 à 250 mL par jour. Une coupure d'eau d'une demi-journée fait chuter la ponte pendant une semaine." },
  { id: "alimP1", nom: "Aliment DÉMARRAGE poussin", freq: "jour", min: 0, max: 42, cat: "Alimentation",
    detail: "Aliment démarrage (20–21 % de protéines). À volonté." },
  { id: "alimP2", nom: "Aliment POULETTE", freq: "jour", min: 43, max: 118, cat: "Alimentation",
    detail: "Aliment poulette (16 % de protéines). Rationner selon le poids : une poulette trop grasse pond mal." },
  { id: "alimP3", nom: "Aliment PONTE", freq: "jour", min: 119, cat: "Alimentation",
    detail: "Aliment ponte (17–18 % de protéines, 3,5 à 4 % de calcium). 110 à 120 g par poule et par jour. Passer à l'aliment ponte à 18 semaines OU dès 5 % de ponte, selon ce qui vient en premier." },
  { id: "coquille", nom: "Complément calcique — coquilles ou calcaire", freq: "jour", min: 119, cat: "Alimentation",
    detail: "Distribuer en fin d'après-midi, à part de l'aliment : la coquille de l'œuf se forme la nuit. Coquilles molles ou cassantes : le calcium manque." },
  { id: "ramassage", nom: "Ramassage des œufs", freq: "jour", min: 119, cat: "Production",
    detail: "Au moins trois fois par jour : matin, midi, fin d'après-midi. Un œuf laissé au nid est un œuf sale, cassé ou couvé." },
  { id: "triOeufs", nom: "Tri et calibrage des œufs", freq: "jour", min: 119, cat: "Production",
    detail: "Séparer propres, sales et cassés. Ne jamais laver un œuf destiné à la vente : le lavage détruit la cuticule et fait entrer les bactéries." },
  { id: "nids", nom: "Entretien des pondoirs", freq: "jour", min: 112, cat: "Ambiance",
    detail: "Litière de pondoir propre et sèche. Un pondoir pour 4 à 5 poules. Pondoirs sales : œufs sales, donc déclassés." },
  { id: "litiereP", nom: "Contrôle de la litière", freq: "jour", cat: "Ambiance",
    detail: "Sèche et meuble. Retourner, remplacer les zones humides." },
  { id: "mortP", nom: "Ramassage des morts et comptage", freq: "jour", cat: "Santé",
    detail: "Matin et soir. Noter le nombre et la cause présumée." },
  { id: "vacP1", nom: "Vaccination Newcastle + Bronchite", freq: "unique", min: 6, max: 9, cat: "Santé",
    detail: "Premier rappel à l'eau de boisson." },
  { id: "vacP2", nom: "Vaccination Gumboro", freq: "unique", min: 12, max: 16, cat: "Santé",
    detail: "À l'eau de boisson." },
  { id: "vacP3", nom: "Rappel Newcastle avant l'entrée en ponte", freq: "unique", min: 100, max: 115, cat: "Santé",
    detail: "Rappel indispensable : une Newcastle en pleine ponte arrête l'élevage." },
  { id: "deparaP", nom: "Déparasitage", freq: "periode", periode: 90, min: 56, cat: "Santé",
    detail: "Vermifuge selon prescription. Respecter le délai d'attente : les œufs pondus pendant ce délai ne se vendent pas." },
  { id: "peseeP", nom: "Pesée d'un échantillon", freq: "periode", periode: 14, min: 14, cat: "Contrôle",
    detail: "Peser 20 sujets. L'homogénéité du lot compte autant que le poids moyen : plus de 10 % d'écart, la ponte sera irrégulière." },
  { id: "biosecP", nom: "Biosécurité — pédiluve et interdiction d'entrée", freq: "jour", cat: "Biosécurité",
    detail: "Pédiluve à l'entrée, renouvelé chaque semaine. Aucun visiteur." },
];

/* Aliments autorisés par spéculation ET par âge — c'est ce qui alimente
   les listes déroulantes du poulailler. */
const ALIMENT_PAR_AGE = {
  "Poulets de chair": [
    { min: 0, max: 10, article: "ALI01", libelle: "Démarrage — 21 à 22 % de protéines" },
    { min: 11, max: 24, article: "ALI02", libelle: "Croissance — 19 à 20 % de protéines" },
    { min: 25, max: 9999, article: "ALI03", libelle: "Finition — 18 % de protéines" },
  ],
  "Poules pondeuses": [
    { min: 0, max: 42, article: "ALI01", libelle: "Démarrage poussin — 20 à 21 % de protéines" },
    { min: 43, max: 118, article: "ALI04", libelle: "Poulette — 16 % de protéines" },
    { min: 119, max: 9999, article: "ALI05", libelle: "Ponte — 17 à 18 % de protéines, 3,5 à 4 % de calcium" },
  ],
};

/* Intrants autorisés par spéculation. Tout le reste est masqué dans les
   listes déroulantes : on ne peut pas donner de l'engrais à une poule. */
const INTRANTS_AUTORISES = {
  "Tomate Trinity F1": { Engrais: ["ENG01", "ENG02", "ENG03", "ENG04", "ENG05", "ENG09", "ENG10", "ENG11", "ENG13", "ENG15"],
    Phyto: ["PHY01", "PHY02", "PHY03", "PHY04", "PHY05", "PHY06", "PHY07", "PHY08", "PHY09", "PHY10", "PHY11", "PHY12", "PHY13", "PHY14", "PHY15", "PHY16", "PHY17"] },
  "Pépinière tomate": { Engrais: ["ENG09"], Phyto: ["PHY01", "PHY11", "PHY12"] },
  "Banane Williams AAA": { Engrais: ["ENG04", "ENG05", "ENG06", "ENG08", "ENG10", "ENG11", "ENG12", "ENG14", "ENG15", "ENG16"],
    Phyto: ["PHY01", "PHY03", "PHY05", "PHY06", "PHY07", "PHY12", "PHY16", "PHY18"] },
  "Pépinière PIF": { Engrais: ["ENG14", "ENG15"], Phyto: ["PHY01"] },
  "Poulets de chair": { Aliment: ["ALI01", "ALI02", "ALI03", "ALI07", "ALI08"], Vétérinaire: ["VET01", "VET02", "VET03", "VET04", "VET05", "VET06"] },
  "Poules pondeuses": { Aliment: ["ALI01", "ALI04", "ALI05", "ALI06", "ALI07", "ALI08"], Vétérinaire: ["VET01", "VET02", "VET03", "VET04", "VET05", "VET06"] },
};
INTRANTS_AUTORISES["Tomate Star 9037 F1"] = INTRANTS_AUTORISES["Tomate Trinity F1"];
INTRANTS_AUTORISES["Plantain AAB"] = INTRANTS_AUTORISES["Banane Williams AAA"];

/* Tâches proposées par spéculation — la liste s'adapte à l'atelier choisi. */
const TACHES_PAR_CULTURE = {
  "Tomate Trinity F1": ["Fertigation", "Arrosage simple", "Taille / ébourgeonnage", "Palissage", "Effeuillage bas",
    "Baisser les plants", "Traitement phyto", "Scouting", "Récolte", "Tri", "Désherbage",
    "Contrôle des goutteurs", "Nettoyage des allées", "Ombrière", "Arrachage fin de cycle", "Autre"],
  "Pépinière tomate": ["Semis", "Arrosage pépinière", "Fertilisation pépinière", "Traitement phyto",
    "Durcissement", "Tri des plants", "Repiquage", "Nettoyage", "Autre"],
  "Banane Williams AAA": ["Effeuillage sanitaire", "Œilletonnage", "Ensachage", "Déclochage", "Tuteurage",
    "Épandage engrais", "Épandage de cendres", "Traitement phyto", "Récolte de régimes", "Post-récolte / bains",
    "Désherbage", "Paillage", "Contrôle du goutte-à-goutte", "Pièges charançon", "Plantation / remplacement", "Autre"],
  "Pépinière PIF": ["Préparation des cormes", "Désinfection", "Mise au germoir", "Arrosage germoir",
    "Sevrage en pots", "Endurcissement", "Tri des plants", "Autre"],
  "Poulets de chair": ["Distribution d'aliment", "Nettoyage des abreuvoirs", "Entretien de la litière",
    "Ramassage des morts", "Pesée", "Vaccination", "Réglage du chauffage", "Nettoyage du bâtiment",
    "Désinfection", "Enlèvement / vente", "Autre"],
  "Poules pondeuses": ["Distribution d'aliment", "Nettoyage des abreuvoirs", "Ramassage des œufs",
    "Tri et calibrage des œufs", "Entretien des pondoirs", "Entretien de la litière", "Ramassage des morts",
    "Pesée", "Vaccination", "Déparasitage", "Nettoyage du bâtiment", "Autre"],
};
const TACHES_HORS_CULTURE = ["Entretien matériel", "Réparation", "Nettoyage", "Réception d'intrants",
  "Inventaire magasin", "Pompage / irrigation générale", "Gardiennage", "Autre"];

/* Unités proposées selon la tâche — évite « 12 litres de taille ». */
const UNITES_PAR_TACHE = {
  "Fertigation": ["litres", "m³", "minutes"], "Arrosage simple": ["litres", "m³", "minutes"],
  "Arrosage pépinière": ["litres", "minutes"], "Arrosage germoir": ["litres", "minutes"],
  "Taille / ébourgeonnage": ["plants", "rangs", "lignes"], "Palissage": ["plants", "rangs"],
  "Effeuillage bas": ["plants", "rangs"], "Baisser les plants": ["plants", "rangs"],
  "Traitement phyto": ["litres", "plants", "pieds", "m²"], "Scouting": ["plants", "pièges"],
  "Récolte": ["kg", "caisses"], "Tri": ["kg", "caisses"], "Récolte de régimes": ["régimes", "kg"],
  "Post-récolte / bains": ["régimes", "kg", "caisses"], "Désherbage": ["m²", "rangs", "pieds"],
  "Contrôle des goutteurs": ["lignes", "rangs"], "Contrôle du goutte-à-goutte": ["lignes", "rangs"],
  "Nettoyage des allées": ["m²", "rangs"], "Ombrière": ["m²", "minutes"],
  "Arrachage fin de cycle": ["plants", "rangs"], "Semis": ["plaques", "graines"],
  "Fertilisation pépinière": ["litres", "plaques"], "Durcissement": ["plaques", "minutes"],
  "Tri des plants": ["plants", "plaques"], "Repiquage": ["plants", "rangs"],
  "Effeuillage sanitaire": ["pieds", "feuilles"], "Œilletonnage": ["pieds", "rejets"],
  "Ensachage": ["régimes", "sacs"], "Déclochage": ["régimes"], "Tuteurage": ["pieds", "tuteurs"],
  "Épandage engrais": ["kg", "pieds", "sacs"], "Épandage de cendres": ["kg", "pieds", "seaux"],
  "Paillage": ["pieds", "m²", "brouettes"], "Pièges charançon": ["pièges"],
  "Plantation / remplacement": ["pieds", "trous"], "Préparation des cormes": ["cormes"],
  "Désinfection": ["cormes", "litres", "m²"], "Mise au germoir": ["cormes"],
  "Sevrage en pots": ["plantules", "pots"], "Endurcissement": ["pots", "jours"],
  "Distribution d'aliment": ["kg", "sacs"], "Nettoyage des abreuvoirs": ["abreuvoirs", "minutes"],
  "Entretien de la litière": ["m²", "sacs", "brouettes"], "Ramassage des morts": ["sujets"],
  "Ramassage des œufs": ["œufs", "plateaux"], "Tri et calibrage des œufs": ["œufs", "plateaux"],
  "Entretien des pondoirs": ["pondoirs", "minutes"], "Pesée": ["sujets"],
  "Vaccination": ["sujets", "doses"], "Déparasitage": ["sujets", "doses"],
  "Réglage du chauffage": ["minutes"], "Nettoyage du bâtiment": ["m²", "minutes"],
  "Enlèvement / vente": ["sujets", "kg"], "Conditionnement / calibrage": ["kg", "caisses"],
  "Pesée": ["sujets", "kg"], "Chargement": ["caisses", "kg"], "Livraison client": ["caisses", "kg"],
  "Réception d'intrants": ["sacs", "kg", "litres", "colis"], "Inventaire magasin": ["articles", "minutes"],
  "Nettoyage des caisses": ["caisses"], "Entretien matériel": ["minutes", "pcs"],
  "Réparation": ["minutes", "pcs"], "Nettoyage": ["m²", "minutes"],
  "Pompage / irrigation générale": ["m³", "minutes"], "Gardiennage": ["heures"],
};
const UNITES_TOUTES = ["plants", "pieds", "rangs", "lignes", "m²", "m³", "régimes", "caisses", "sacs",
  "kg", "litres", "minutes", "heures", "sujets", "œufs", "plateaux", "doses", "pièges", "pots",
  "plaques", "cormes", "plantules", "rejets", "feuilles", "tuteurs", "trous", "seaux", "brouettes",
  "abreuvoirs", "pondoirs", "graines", "articles", "colis", "pcs", "jours"];

/* ═══════════ PLAN D'EXPLOITATION — EXTRAITS DE RÉFÉRENCE ═══════════
   Résumés des documents validés, consultables depuis chaque écran de
   saisie en fonction de l'âge de la spéculation.                      */
const PLAN_REF = {
  "Tomate Trinity F1": { doc: "PLAN-TOMATE-SERRE-001 v1.0 — 9 mars 2026 · complété par le CALENDRIER ACTIONS TOMATE",
    base: "5 modules de 8 m × 150 m = 6 000 m², environ 9 000 plants, conduite à 2 tiges. Variétés Trinity F1 et Star 9037 F1 (Starke Ayres, indéterminées). Doses du calendrier calibrées pour 5 modules : diviser par 5 pour un seul module actif.",
    phases: [
      { min: 0, max: 14, titre: "Installation (JAT 0–14)",
        texte: "Fixation des ficelles, ombrage 50 % les 3 premiers jours, tuteurage initial. EC 1,2–1,6, NPK équilibré faible. Irrigation 1 à 3 L par plant et par jour. Vérifier la reprise chaque jour. Cuivre foliaire 3 g/L le soir du repiquage." },
      { min: 15, max: 45, titre: "Végétatif (JAT 15–45)",
        texte: "Ébourgeonnage en gardant 2 tiges, attacher les ficelles, commencer à baisser les plants. 8 à 10 kg d'azote, 4 kg de P₂O₅, 12 kg de K₂O par hectare et par semaine. Irrigation 3 à 5 L par plant. Scouting hebdomadaire aleurodes et thrips. Tensiomètres entre −15 et −25 kPa." },
      { min: 46, max: 80, titre: "Floraison – nouaison (JAT 46–80)",
        texte: "Ébourgeonnage hebdomadaire, baisser et pencher les plants, enlever les feuilles basses. 10 à 12 kg d'azote, 3 kg de P₂O₅, 15 kg de K₂O et 5 kg de calcium par hectare et par semaine. Irrigation 4 à 7 L. Température critique sous 30 °C, sinon la pollinisation échoue. Filet anti-insectes et pièges jaunes contre le TYLCV." },
      { min: 81, max: 95, titre: "Première récolte (JAT 81–95)",
        texte: "Début de cueillette : Trinity vers 80–90 JAT, Star 9037 vers 90–95 JAT. Réduire l'azote, augmenter le potassium à 18–20 kg de K₂O. Irrigation 6 à 8 L. Ventilation et fongicide préventif contre le Botrytis. Récolte 2 à 3 fois par semaine, jamais après 9 h." },
      { min: 96, max: 200, titre: "Pic de production (JAT 96–200)",
        texte: "Cueillette régulière, effeuillage bas de 2 à 3 feuilles par semaine, baisser les plants. 6 à 8 kg d'azote, 2 kg de P₂O₅, 18 à 20 kg de K₂O plus calcium. Irrigation 6 à 8 L. Rotation des familles de fongicides et d'insecticides, scouting quotidien, contrôle du calibre. Rinçage acide du Mazzei toutes les 4 semaines." },
      { min: 201, max: 9999, titre: "Fin de cycle (JAT 201 et au-delà)",
        texte: "Continuer la récolte, réduire l'azote, maintenir le potassium haut. Sous 200 kg par semaine : cuivre seul, arrêt de toute chimie 7 jours avant la dernière récolte, arrachage complet, désinfection, repos du sol de 4 à 6 semaines." },
    ] },
  "Pépinière tomate": { doc: "PLAN-TOMATE-SERRE-001 v1.0 — phase pépinière",
    base: "Semis en plaques alvéolées de 128 à 200 cellules, substrat tourbe/perlite stérilisé à pH 6,0–6,5. Germination en 6 à 10 jours à 25–30 °C le jour.",
    phases: [
      { min: 0, max: 6, titre: "Germination (J0–J6)",
        texte: "Semis 1 graine par cellule à 0,5–1 cm. Drench Ridomil Gold MZ 2,5 g/L le jour du semis. Arrosage en pulvérisation fine chaque jour, humide sans être trempé. Gants obligatoires : graines traitées au Thiram." },
      { min: 7, max: 20, titre: "Croissance (J7–J20)",
        texte: "NPK 20-20-20 à 0,5 g/L une fois par semaine, doublé à 1 g/L à partir de J14. Mancozèbe 2 g/L en foliaire à J7, J14 et J21. Ventilation, 22 à 28 °C le jour." },
      { min: 21, max: 34, titre: "Durcissement (J21–J34)",
        texte: "Drench Confidor 0,5 mL/L à J21, environ 30 mL par cellule : c'est la protection contre les aleurodes pour les 3 à 4 semaines suivant le repiquage. Réduire l'eau, exposer progressivement au soleil. ARRÊT du mancozèbe à J28 : une semaine propre avant le repiquage." },
      { min: 35, max: 9999, titre: "Prêt à repiquer (J35 et au-delà)",
        texte: "Critères : 4 à 6 vraies feuilles, 15 à 25 cm, vert foncé, tige solide. Trop petit : attendre 5 à 10 jours. Jeter tout plant jaune ou malade — il ne rattrapera jamais son retard en serre." },
    ] },
  "Banane Williams AAA": { doc: "PLAN-BANANE-001 · CALENDRIER ACTIONS BANANE — mars 2026",
    base: "Plein champ irrigué, espacement 3 m × 2 m, environ 1 600 plants par hectare. Total par plant et par cycle : 250 à 400 g d'azote et 500 à 800 g de K₂O, ratio N:K d'environ 1:3. ATTENTION : le calendrier est calibré pour 1 hectare ; nos trois parcs totalisent 0,4 ha. Toujours convertir en dose par pied.",
    phases: [
      { min: 0, max: 90, titre: "Établissement (mois 1 à 3)",
        texte: "Urée 40 g + K₂SO₄ 65 g par plant et par mois, en cercle à 30 cm du pseudotronc, jamais contre lui. Irrigation 25 à 35 L par plant et par jour en saison sèche. Désherbage 2 fois par mois, rayon 1 m. Paillage vérifié tous les mois, épaisseur 10 cm minimum, sans toucher le pseudotronc. Pièges à charançon dès le mois 1, relevés 2 fois par mois. Nématicide au mois 2." },
      { min: 91, max: 190, titre: "Croissance végétative (mois 4 à 6)",
        texte: "Urée 65 g + K₂SO₄ 130 g + MgSO₄ 30 g par plant et par mois. Irrigation 35 à 45 L. Œilletonnage toutes les 3 à 4 semaines : garder Mère, Fille et Petite-fille, couper tous les autres rejets et enfoncer la machette en croix dans le corme. Effeuillage sanitaire 2 fois par mois. Fongicide toutes les 3 à 4 semaines en alternant mancozèbe et propiconazole. Deuxième et dernier nématicide au mois 4." },
      { min: 191, max: 280, titre: "Pré-floraison (mois 7 à 9)",
        texte: "Urée 100 g + K₂SO₄ 250 g par plant et par mois, en cercle à 50 cm. C'est le pic de potassium : le calibre du régime se décide maintenant. Irrigation 45 à 55 L. Rotation Sigatoka sur 4 applications. Foliaire K₂SO₄ 15 g/L + CaCl₂ 5 g/L deux fois par mois. Effeuillage hebdomadaire si la pression est forte, en gardant 8 feuilles saines minimum." },
      { min: 281, max: 330, titre: "Floraison et remplissage (mois 10 à 12)",
        texte: "Urée 70 g + K₂SO₄ 250 g par plant et par mois. Déclochage à la main 10 à 15 jours après la dernière main femelle — jamais à l'outil, le flétrissement bactérien se transmet par la lame. Ensachage 7 à 10 jours plus tard : sac PE perforé BLEU 80×100 uniquement. Tuteur bambou de 3 m dès que le régime est visible. Mancozèbe seul, pas de systémique. Ne jamais réduire l'eau pendant le remplissage." },
      { min: 331, max: 9999, titre: "Récolte (mois 12 à 14)",
        texte: "Arrêt de toute chimie 14 jours avant la coupe. Maturité : doigts aux trois quarts arrondis, diamètre 35 à 48 mm, 80 à 100 jours après floraison. Deux personnes : le coupeur entaille le pseudotronc à mi-hauteur, le porteur réceptionne sur l'épaule. Ne jamais laisser tomber le régime. Trois bains : alun 20 g/L, chlore 200 ppm, puis TBZ 1 mL/L — sans le troisième, les bananes pourrissent en 3 à 5 jours. Fertiliser la Fille le jour de la coupe : urée 50 g + K₂SO₄ 100 g. Débiter le pseudotronc en paillis. Cycle ratoon suivant : 9 à 10 mois." },
    ] },
  "Pépinière PIF": { doc: "PROTO-PIF-BANANE-001",
    base: "Multiplication par fragments de tige. Durée totale d'environ 4 mois du germoir au plant transplantable. Cause d'échec numéro un : le bourgeon central du corme n'a pas été détruit.",
    phases: [
      { min: 0, max: 10, titre: "Cicatrisation (jours 1 à 10)",
        texte: "Corme de 1 à 3 kg pris sur un pied-mère sain. Parage jusqu'au tissu blanc, centre creusé en cône de 1,5 cm et deux entailles croisées de 1 cm. Bain Javel 1 pour 9 pendant 15 min, puis bain mancozèbe 20 g pour 10 L pendant 15 min, cendre de bois sur les coupes, ressuyage 24 h. Sciure propre de 15 à 20 cm, humide comme une éponge essorée." },
      { min: 11, max: 42, titre: "Sortie des plantules (semaines 2 à 6)",
        texte: "Bourgeons blancs en semaine 2 à 3 : ne rien toucher. Pousses vertes en semaine 3 à 4. Plantules à 2 ou 3 feuilles en semaine 5 à 6. Arrosage au pulvérisateur une fois le matin. Retirer chaque jour tout corme mou, noir ou malodorant." },
      { min: 43, max: 83, titre: "Croissance en pot (semaines 6 à 12)",
        texte: "Sevrage dès 2 à 3 feuilles et de petites racines. Terreau : 3 mesures de terre, 2 de sable, 1 de fumier décomposé. Une plantule par pot. Une semaine sous ombrière à 50 %, puis lumière croissante. Remettre le corme au germoir : il redonnera d'autres plantules." },
      { min: 84, max: 97, titre: "Endurcissement (semaines 12 à 14)",
        texte: "Plein soleil et arrosage un jour sur deux pendant les deux dernières semaines." },
      { min: 98, max: 9999, titre: "Prêt à transplanter (semaine 14 et au-delà)",
        texte: "Critères : 25 à 40 cm, 4 à 6 feuilles saines, base d'au moins 1,5 cm, racines blanches remplissant le pot, aucune tache. Un plant trop petit ou jaune ne va pas au champ : il mourra." },
    ] },
  "Poulets de chair": { doc: "RÉFÉRENCE TECHNIQUE STANDARD — À VALIDER PAR LA DIRECTION",
    base: "Aucun plan avicole ne figure au dossier du projet. Les valeurs ci-dessous sont les références commerciales courantes pour le poulet de chair et doivent être confirmées avant d'être imposées à l'équipe. Densité 10 à 12 sujets par m², une mangeoire pour 50 sujets, un abreuvoir pour 80.",
    phases: [
      { min: 0, max: 10, titre: "Démarrage (J0–J10)",
        texte: "Aliment démarrage en miettes, 21 à 22 % de protéines, à volonté. Température 33 °C la première semaine, puis −3 °C par semaine. Eau tiède les premiers jours. Poussins entassés sous la lampe : trop froid. Poussins collés aux murs : trop chaud. Vaccination Newcastle et bronchite entre J6 et J9, à l'eau de boisson, sans désinfectant dans l'eau. Objectif de poids : 180 g à J7." },
      { min: 11, max: 24, titre: "Croissance (J11–J24)",
        texte: "Aliment croissance, 19 à 20 % de protéines. Transition sur 3 jours en mélangeant les deux aliments. Vaccination Gumboro entre J12 et J16, rappel Newcastle entre J20 et J24. Objectifs de poids : 500 g à J14, 1 000 g à J21." },
      { min: 25, max: 9999, titre: "Finition (J25 à l'enlèvement)",
        texte: "Aliment finition, 18 % de protéines. Objectifs : 1 600 g à J28, 2 400 g à J42. Respecter le délai d'attente des additifs avant abattage. Après enlèvement : sortir la litière, laver, désinfecter, vide sanitaire de 14 jours minimum avant la bande suivante." },
    ] },
  "Poules pondeuses": { doc: "RÉFÉRENCE TECHNIQUE STANDARD — À VALIDER PAR LA DIRECTION",
    base: "Aucun plan avicole ne figure au dossier du projet. Références commerciales courantes pour la pondeuse. Un pondoir pour 4 à 5 poules. Consommation d'eau de 200 à 250 mL par poule et par jour.",
    phases: [
      { min: 0, max: 42, titre: "Démarrage poussin (semaines 1 à 6)",
        texte: "Aliment démarrage 20 à 21 % de protéines, à volonté. Même conduite thermique que le poulet de chair. Vaccinations Newcastle et bronchite entre J6 et J9, Gumboro entre J12 et J16." },
      { min: 43, max: 118, titre: "Poulette (semaines 7 à 17)",
        texte: "Aliment poulette 16 % de protéines, rationné selon le poids : une poulette trop grasse pond mal et se déforme. Pesée d'un échantillon de 20 sujets toutes les deux semaines — l'homogénéité du lot compte autant que le poids moyen. Rappel Newcastle avant l'entrée en ponte, entre J100 et J115 : une Newcastle en pleine ponte arrête l'élevage. Installer les pondoirs vers la 16e semaine." },
      { min: 119, max: 9999, titre: "Ponte (semaine 18 et au-delà)",
        texte: "Aliment ponte 17 à 18 % de protéines et 3,5 à 4 % de calcium, 110 à 120 g par poule et par jour. Passer à l'aliment ponte à 18 semaines ou dès 5 % de ponte, selon ce qui vient en premier. Complément calcique en fin d'après-midi, séparé de l'aliment : la coquille se forme la nuit. Ramassage des œufs au moins trois fois par jour. Ne jamais laver un œuf destiné à la vente. Pic de ponte attendu vers 28 à 32 semaines, au-dessus de 90 %." },
    ] },
};
const phaseRef = (type, j) => {
  const p = PLAN_REF[type]; if (!p) return null;
  return p.phases.find((x) => j >= x.min && j <= x.max) || null;
};

const CULTURES = {
  "Tomate Trinity F1": { milieu: "TOM", depart: "repiquage", taches: T_TOMATE, cible: 13, uniteCible: "kg/plant",
    phases: [[0, 14, "Installation"], [15, 45, "Végétatif"], [46, 80, "Floraison – nouaison"],
      [81, 95, "Première récolte"], [96, 200, "Pic de production"], [201, 9999, "Fin de cycle"]] },
  "Tomate Star 9037 F1": { milieu: "TOM", depart: "repiquage", taches: T_TOMATE, cible: 13, uniteCible: "kg/plant",
    phases: [[0, 14, "Installation"], [15, 45, "Végétatif"], [46, 85, "Floraison – nouaison"],
      [86, 100, "Première récolte"], [101, 200, "Pic de production"], [201, 9999, "Fin de cycle"]] },
  "Pépinière tomate": { milieu: "TOM", depart: "semis", taches: T_PEPI_TOM, cible: 0, uniteCible: "",
    phases: [[0, 6, "Germination"], [7, 20, "Croissance"], [21, 34, "Durcissement"], [35, 9999, "Prêt à repiquer"]] },
  "Banane Williams AAA": { milieu: "BAN", depart: "plantation", taches: T_BANANE, cible: 20, uniteCible: "kg/pied",
    poidsRegime: 18, delaiCoupe: 70,
    phases: [[0, 90, "Établissement"], [91, 190, "Croissance végétative"], [191, 280, "Pré-floraison"],
      [281, 330, "Floraison – remplissage"], [331, 9999, "Récolte"]] },
  "Plantain AAB": { milieu: "BAN", depart: "plantation", taches: T_BANANE, cible: 12, uniteCible: "kg/pied",
    poidsRegime: 12, delaiCoupe: 60,
    phases: [[0, 90, "Établissement"], [91, 190, "Croissance végétative"], [191, 290, "Pré-floraison"],
      [291, 340, "Floraison – remplissage"], [341, 9999, "Récolte"]] },
  "Pépinière PIF": { milieu: "BAN", depart: "mise au germoir", taches: T_PIF, cible: 0, uniteCible: "",
    phases: [[0, 10, "Cicatrisation"], [11, 42, "Sortie des plantules"], [43, 83, "Croissance en pot"],
      [84, 97, "Endurcissement"], [98, 9999, "Prêt à transplanter"]] },
  "Poulets de chair": { milieu: "AVI", depart: "mise en place des poussins", taches: T_CHAIR,
    cible: 2.4, uniteCible: "kg vif/sujet",
    phases: [[0, 10, "Démarrage"], [11, 24, "Croissance"], [25, 41, "Finition"], [42, 9999, "Enlèvement"]] },
  "Poules pondeuses": { milieu: "AVI", depart: "mise en place des poussins", taches: T_PONDEUSE,
    cible: 300, uniteCible: "œufs/poule/an",
    phases: [[0, 42, "Démarrage poussin"], [43, 118, "Poulette"], [119, 154, "Entrée en ponte"],
      [155, 560, "Ponte"], [561, 9999, "Fin de bande"]] },
};

const CULTURES_INITIALES = {
  "Module 1": { type: "Tomate Trinity F1", debut: "2026-03-30", effectif: "1800", note: "", aConfirmer: false },
  "Parc 1": { type: "Banane Williams AAA", debut: "2025-08-25", effectif: "", note: "Âge estimé à 12 mois", aConfirmer: true },
  "Parc 2": { type: "Banane Williams AAA", debut: "2025-08-25", effectif: "", note: "Âge estimé à 12 mois", aConfirmer: true },
  "Parc 3": { type: "Plantain AAB", debut: "2025-09-15", effectif: "130", note: "130 pieds-mères retenus", aConfirmer: true },
};

/* Rubans de marquage : ni noir ni gris, pour éviter toute confusion
   avec les sacs de gainage interdits. Rotation sur 12 semaines. */
const RUBANS = ["Rouge", "Blanc", "Bleu", "Jaune", "Vert", "Orange",
  "Marron", "Violet", "Rose", "Bleu clair", "Beige", "Turquoise"];

const TACHES_LIBRES = {
  TOM: ["Fertigation", "Arrosage simple", "Taille / ébourgeonnage", "Palissage", "Effeuillage bas",
    "Traitement phyto", "Récolte", "Tri", "Semis pépinière", "Repiquage", "Désherbage",
    "Contrôle des goutteurs", "Nettoyage des allées", "Ombrière", "Arrachage fin de cycle",
    "Préparation de module", "Entretien matériel", "Autre"],
  BAN: ["Effeuillage sanitaire", "Œilletonnage", "Ensachage", "Déclochage", "Tuteurage",
    "Épandage engrais", "Épandage de cendres", "Traitement phyto", "Récolte de régimes",
    "Post-récolte / bains", "Désherbage", "Paillage", "Contrôle du goutte-à-goutte",
    "Plantation / remplacement", "Suivi pépinière PIF", "Pièges charançon", "Entretien matériel", "Autre"],
  LIV: ["Conditionnement / calibrage", "Pesée", "Chargement", "Livraison client", "Réception d'intrants",
    "Inventaire magasin", "Nettoyage des caisses", "Autre"],
  AVI: ["Distribution d'aliment", "Nettoyage des abreuvoirs", "Ramassage des œufs", "Tri et calibrage des œufs",
    "Entretien des pondoirs", "Entretien de la litière", "Ramassage des morts", "Pesée", "Vaccination",
    "Déparasitage", "Réglage du chauffage", "Nettoyage du bâtiment", "Désinfection", "Enlèvement / vente", "Autre"],
};
const UNITES = ["plants", "pieds", "rangs", "lignes", "m²", "régimes", "caisses", "sacs", "kg", "litres", "minutes"];
const COULEURS_SAC = ["Bleu perforé — conforme", "Noir — INTERDIT", "Gris — INTERDIT", "Autre couleur — à vérifier"];
const QUALITES = ["Grade A — premium", "Grade B — marché local", "Grade C — écarté / transformation"];
const MOTIFS_ECART = ["Fissuré", "Trop mûr", "Trop petit", "Attaque insecte", "Maladie",
  "Nécrose apicale (cul noir)", "Choc / écrasement", "Latex sur la peau", "Autre"];
const CLIENTS = ["Top Market", "Vente locale", "Autre"];
const PRODUITS_VENDUS = ["Tomates de serre — Culture Contrôlée", "Bananes Williams", "Plantains", "Autre"];

const POIDS_CAISSE_MAX = 15;
const DELAI_CENDRE_UREE = 14;
const ALERTE_PEREMPTION = 60;

/* ═══════════ OUTILS ═══════════ */
const C = {
  ink: "#17372A", green: "#176B45", green2: "#2E8B62", laterite: "#BF5A32",
  paper: "#F5F8F3", line: "#D5E0D4", red: "#B93832", amber: "#D88818",
  ban: "#7D6818", liv: "#32658D", avi: "#9A4B35", gris: "#607068",
};
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .carnet-app, .carnet-app * { box-sizing: border-box; }
  .carnet-app { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  .carnet-app input, .carnet-app select, .carnet-app textarea { box-shadow: 0 1px 2px rgba(23,55,42,.04); transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
  .carnet-app input:hover, .carnet-app select:hover, .carnet-app textarea:hover { border-color: #9BB9A8 !important; }
  .carnet-app input:focus, .carnet-app select:focus, .carnet-app textarea:focus { outline: none; border-color: #176B45 !important; box-shadow: 0 0 0 3px rgba(23,107,69,.16) !important; }
  .carnet-app button { min-height: 44px; transition: transform .16s ease, filter .16s ease, box-shadow .16s ease; }
  .carnet-app button:not(:disabled):hover { filter: brightness(.97); box-shadow: 0 4px 10px rgba(23,55,42,.12); }
  .carnet-app button:not(:disabled):active { transform: translateY(1px); box-shadow: none; }
  .carnet-app button:focus-visible { outline: 3px solid rgba(216,136,24,.55); outline-offset: 2px; }
  .carnet-app button:disabled { opacity: .48; }
  .carnet-app ::placeholder { color: #829188; opacity: 1; }
  .carnet-app img { max-width: 100%; }
  @media (max-width: 480px) {
    .carnet-app input, .carnet-app select, .carnet-app textarea { font-size: 16px !important; }
    .carnet-app pre { white-space: pre-wrap !important; overflow-wrap: anywhere; }
  }`;
const OSW = "Oswald, sans-serif";

const auj = () => new Date().toISOString().slice(0, 10);
const jours = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
const plusJours = (d, n) => new Date(new Date(d + "T12:00:00").getTime() + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(d + "T12:00:00").getDay();
const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const semaineIso = (d) => {
  const t = new Date(d + "T12:00:00");
  const j = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  j.setUTCDate(j.getUTCDate() + 4 - (j.getUTCDay() || 7));
  return Math.ceil(((j - new Date(Date.UTC(j.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
};
const rubanDe = (d) => RUBANS[(semaineIso(d) - 1) % RUBANS.length];
const codeFrac = (p) => { const m = /\((FRAC|IRAC)\s+([A-Z0-9+]+)\)/.exec(p || ""); return m ? m[1] + " " + m[2] : ""; };
const num = (v) => parseFloat(v) || 0;
const usd = (v) => (Math.round(num(v) * 100) / 100).toFixed(2);
const heure = () => new Date().toLocaleTimeString("fr-FR").slice(0, 5);
const courtNom = (a) => (a || "").split(" —")[0];
const uid = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function phaseDe(type, j) {
  const c = CULTURES[type]; if (!c) return "";
  const p = c.phases.find(([a, b]) => j >= a && j <= b);
  return p ? p[2] : "";
}
function tachesDues(zone, culture, date, regTaches, catalogue = CULTURES) {
  const cat = catalogue[culture.type]; if (!cat) return [];
  const j = jours(culture.debut, date);
  if (j < 0) return [];
  const d = dow(date), out = [];
  for (const t of cat.taches) {
    if (j < (t.min || 0) || j > (t.max === undefined ? 99999 : t.max)) continue;
    const k = `${zone}|${t.id}`;
    const last = regTaches[k] || "";
    const faitAuj = last === date;
    let due = false, retard = 0, rythme = "";
    if (t.freq === "jour") { due = true; rythme = "chaque jour"; }
    else if (t.freq === "sem") {
      rythme = "chaque " + JOURS_FR[t.jour];
      if (d === t.jour) due = true;
      const ec = last ? jours(last, date) : j - (t.min || 0);
      if (ec >= 10) { due = true; retard = ec - 7; }
    } else if (t.freq === "periode") {
      rythme = `tous les ${t.periode} jours`;
      due = (j - (t.min || 0)) % t.periode === 0;
    } else if (t.freq === "unique") {
      rythme = "une seule fois";
      if (!last) due = true;
    }
    if (faitAuj || due) out.push({ ...t, cle: k, due, faitAuj, retard, rythme, dernier: last });
  }
  return out.sort((a, b) => (b.retard - a.retard) || (a.faitAuj - b.faitAuj));
}
const csvLigne = (arr) => arr.map((v) => {
  const s = String(v === undefined || v === null ? "" : v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(";");

/* ═══════════ COMPOSANTS ═══════════ */
function Label({ children }) {
  return <div style={{ fontFamily: OSW, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase",
    color: C.green, marginBottom: 6, fontWeight: 600 }}>{children}</div>;
}
function Titre({ children, couleur }) {
  return <div style={{ fontFamily: OSW, fontSize: 19, fontWeight: 700, margin: "20px 0 10px",
    color: couleur || C.ink }}>{children}</div>;
}
function Select({ value, onChange, options, placeholder }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}
    style={{ width: "100%", padding: "14px 12px", fontSize: 17, borderRadius: 10, border: `1px solid ${C.line}`,
      background: "#fff", color: C.ink, fontFamily: "Inter, sans-serif", marginBottom: 14 }}>
    <option value="">{placeholder}</option>
    {options.map((o) => typeof o === "string"
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.v} value={o.v}>{o.t}</option>)}
  </select>;
}
function TextIn({ value, onChange, placeholder, lines, type }) {
  const P = lines ? "textarea" : "input";
  return React.createElement(P, { value, onChange: (e) => onChange(e.target.value), placeholder,
    rows: lines || undefined, type: type || "text",
    style: { width: "100%", padding: "14px 12px", fontSize: 17, borderRadius: 10, border: `1px solid ${C.line}`,
      background: "#fff", color: C.ink, fontFamily: "Inter, sans-serif", marginBottom: 14, resize: "vertical" } });
}
function DateIn({ value, onChange, rouge }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
    style={{ width: "100%", padding: 14, fontSize: 17, borderRadius: 10, marginBottom: 14,
      border: `${rouge ? 2 : 1}px solid ${rouge ? C.red : C.line}`, background: "#fff", fontFamily: "Inter, sans-serif", color: C.ink }} />;
}
function Compteur({ value, onChange, unite, setUnite, unites, pas }) {
  const p = pas || 1;
  const step = (d) => onChange(Math.round((num(value) + d * p) * 100) / 100);
  const Btn = ({ d, ch }) => (
    <button onClick={() => step(d)} aria-label={d > 0 ? "augmenter" : "diminuer"}
      style={{ width: 60, height: 60, fontSize: 30, fontWeight: 700, borderRadius: 10,
        border: `2px solid ${C.green}`, background: C.green, color: "#fff", fontFamily: OSW,
        cursor: "pointer", flexShrink: 0 }}>{ch}</button>);
  return <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Btn d={-1} ch="−" />
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 38, fontWeight: 700, padding: "8px 4px",
          borderRadius: 10, border: `2px solid ${C.laterite}`, fontFamily: OSW, color: C.ink, background: "#fff" }} />
      <Btn d={1} ch="+" />
    </div>
    {unites && <select value={unite} onChange={(e) => setUnite(e.target.value)}
      style={{ width: "100%", marginTop: 10, padding: 12, fontSize: 16, borderRadius: 10,
        border: `1px solid ${C.line}`, background: "#fff", fontFamily: "Inter, sans-serif" }}>
      {unites.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>}
  </div>;
}
function Card({ children, tone }) {
  return <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `5px solid ${tone || C.green2}`,
    borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: "0 2px 8px rgba(23,55,42,.045)" }}>{children}</div>;
}
function Bouton({ onClick, children, tone, petit }) {
  const bg = tone === "danger" ? C.red : tone === "wa" ? "#1EA55C" : tone === "mail" ? C.liv
    : tone === "ghost" ? "#fff" : tone === "vert" ? C.green : C.laterite;
  return <button onClick={onClick}
    style={{ width: "100%", padding: petit ? 12 : 18, fontSize: petit ? 15 : 18, fontWeight: 700, borderRadius: 10,
      border: tone === "ghost" ? `2px solid ${C.line}` : "none", background: bg,
      color: tone === "ghost" ? C.ink : "#fff", fontFamily: OSW, letterSpacing: 0.8,
      textTransform: "uppercase", cursor: "pointer", marginBottom: 10 }}>{children}</button>;
}
function Supprimer({ onClick, texte }) {
  return <button onClick={onClick} style={{ marginTop: 8, background: "none", border: "none", color: C.red,
    fontSize: 14, cursor: "pointer", padding: 0, fontWeight: 600 }}>{texte || "Retirer"}</button>;
}
function Alerte({ children, tone }) {
  return <div style={{ background: tone === "amber" ? C.amber : C.red, color: "#fff", padding: 14, borderRadius: 10,
    marginBottom: 14, fontWeight: 700, fontSize: 15, lineHeight: 1.45 }}>{children}</div>;
}
function Note({ children, tone }) {
  return <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `5px solid ${tone || C.amber}`, padding: 14, borderRadius: 10,
    marginBottom: 14, fontSize: 14.5, lineHeight: 1.55 }}>{children}</div>;
}
function Stat({ libelle, valeur, sous, couleur }) {
  return <div style={{ background: couleur || C.green, color: "#fff", padding: 14, borderRadius: 12, marginBottom: 10 }}>
    <div style={{ fontSize: 12.5, letterSpacing: 1.3, fontFamily: OSW, textTransform: "uppercase" }}>{libelle}</div>
    <div style={{ fontSize: 32, fontWeight: 700, fontFamily: OSW, lineHeight: 1.15 }}>{valeur}</div>
    {sous && <div style={{ fontSize: 13.5, marginTop: 2 }}>{sous}</div>}
  </div>;
}
function Photos({ ids, images, onAjout, onRetrait }) {
  const ref = useRef(null);
  return <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: ids.length ? 10 : 0 }}>
      {ids.map((id) => (
        <div key={id} style={{ position: "relative" }}>
          <img src={images[id]} alt="" style={{ width: 86, height: 86, objectFit: "cover", borderRadius: 4,
            border: `2px solid ${C.line}` }} />
          {onRetrait && <button onClick={() => onRetrait(id)} style={{ position: "absolute", top: -6, right: -6,
            width: 26, height: 26, borderRadius: 13, border: "none", background: C.red, color: "#fff",
            fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>×</button>}
        </div>))}
    </div>
    {onAjout && <>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onAjout(f); e.target.value = ""; }} />
      <button onClick={() => ref.current && ref.current.click()}
        style={{ width: "100%", padding: 14, borderRadius: 4, border: `2px dashed ${C.line}`, background: "#fff",
          color: C.green, fontFamily: OSW, fontSize: 15, fontWeight: 700, letterSpacing: 0.6,
          textTransform: "uppercase", cursor: "pointer" }}>📷 Prendre une photo</button>
    </>}
  </div>;
}

function ChoixAgent({ valeur, manuel, onValeur, onManuel }) {
  return <>
    <Select value={valeur} onChange={onValeur} options={[...AGENTS, "Autre — écrire le nom"]} placeholder="Choisir un nom" />
    {valeur === "Autre — écrire le nom" &&
      <TextIn value={manuel || ""} onChange={onManuel} placeholder="Nom et prénom de la personne" />}
  </>;
}
function BlocPlan({ zone, cultures, date, onOuvrir, couleur }) {
  const c = cultures[zone]; if (!c) return null;
  const j = jours(c.debut, date);
  const ph = phaseRef(c.type, j);
  if (!ph) return null;
  return <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `5px solid ${couleur || C.green}`,
    borderRadius: 4, padding: 14, marginBottom: 14 }}>
    <div style={{ fontFamily: OSW, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: C.green }}>
      Ce que le plan prévoit à J+{j}</div>
    <div style={{ fontFamily: OSW, fontSize: 16.5, fontWeight: 700, marginTop: 3 }}>{ph.titre}</div>
    <div style={{ fontSize: 14.5, marginTop: 6, lineHeight: 1.55 }}>{ph.texte}</div>
    <button onClick={onOuvrir} style={{ marginTop: 10, background: "none", border: "none", padding: 0,
      color: C.liv, fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "underline",
      textAlign: "left" }}>Ouvrir le plan — {PLAN_REF[c.type].doc} ▸</button>
  </div>;
}

/* ═══════════════ APPLICATION ═══════════════ */
const CULTURES_BASE = CULTURES;
export default function Carnet() {
  const { taskTemplates = [], auth } = usePage().props;
  const CULTURES = Object.fromEntries(Object.entries(CULTURES_BASE).map(([type, config]) => {
    const rules = taskTemplates.filter((t) => t.crop_type === type);
    return [type, { ...config, taches: rules.length ? rules.filter((t) => t.is_active).map((t) => ({
      id: t.task_key, nom: t.title, detail: t.instructions, cat: t.category, freq: t.frequency,
      min: t.min_day, max: t.max_day ?? undefined, jour: t.weekday, periode: t.interval_days,
    })) : config.taches }];
  }));
  const [tachesServeur, setTachesServeur] = useState(null);
  const [erreurTaches, setErreurTaches] = useState("");
  /* accès */
  const [etape, setEtape] = useState(() => window.localStorage.getItem("dtomate:access:agent") ? "ok" : window.localStorage.getItem("dtomate:access:site-approved") === CODE_SITE_DEFAUT ? "agent" : "site");
  const [codeSite, setCodeSite] = useState(CODE_SITE_DEFAUT);
  const [saisieSite, setSaisieSite] = useState("");
  const [agent, setAgent] = useState(() => window.localStorage.getItem("dtomate:access:agent") || "");
  const [saisieCode, setSaisieCode] = useState("");
  const [codes, setCodes] = useState({});
  const [erreurAcces, setErreurAcces] = useState("");

  /* navigation */
  const [bureau, setBureau] = useState("TOM");
  const [date, setDate] = useState(auj());
  useEffect(() => {
    const controller = new AbortController();
    setTachesServeur(null); setErreurTaches("");
    fetch(`/taches/synthese?date=${encodeURIComponent(date)}`, { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Suivi des tâches indisponible"); return r.json(); })
      .then((data) => { setTachesServeur(data.tasks); setRegTaches(data.lastExecutions || {}); })
      .catch((error) => { if (error.name !== "AbortError") setErreurTaches("Le suivi des tâches n'a pas pu être chargé. Ouvrez l'espace Tâches quotidiennes."); });
    return () => controller.abort();
  }, [date]);
  const [onglet, setOnglet] = useState("accueil");
  const [sousPage, setSousPage] = useState("");
  const [etat, setEtat] = useState("");
  const [histo, setHisto] = useState([]);
  const [csv, setCsv] = useState("");
  const [perDebut, setPerDebut] = useState("");
  const [perFin, setPerFin] = useState("");
  const [perTout, setPerTout] = useState(false);
  const [meta, setMeta] = useState(null);
  const [jsonColle, setJsonColle] = useState("");
  const [modeRestauration, setModeRestauration] = useState("");
  const [avecPhotos, setAvecPhotos] = useState(false);
  const [inventaireCles, setInventaireCles] = useState(null);

  /* registres permanents */
  const [cultures, setCultures] = useState({});
  const [archives, setArchives] = useState([]);
  const [regTaches, setRegTaches] = useState({});
  const [dar, setDar] = useState({});
  const [cendres, setCendres] = useState({});
  const [journal, setJournal] = useState([]);
  const [articles, setArticles] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [lots, setLots] = useState([]);
  const [regimes, setRegimes] = useState([]);
  const [cumul, setCumul] = useState({});
  const [traitZone, setTraitZone] = useState({});
  const [mesuresH, setMesuresH] = useState([]);
  const [images, setImages] = useState({});

  /* journée */
  const [meteo, setMeteo] = useState("");
  const [presence, setPresence] = useState([]);
  const [travaux, setTravaux] = useState([]);
  const [engrais, setEngrais] = useState([]);
  const [phyto, setPhyto] = useState([]);
  const [mesures, setMesures] = useState([]);
  const [recoltes, setRecoltes] = useState([]);
  const [gainage, setGainage] = useState([]);
  const [livraisons, setLivraisons] = useState([]);
  const [problemes, setProblemes] = useState([]);
  const [tachesFaites, setTachesFaites] = useState([]);
  const [alimentation, setAlimentation] = useState([]);
  const [ponte, setPonte] = useState([]);
  const [sante, setSante] = useState([]);
  const [cheptel, setCheptel] = useState([]);
  const [refCulture, setRefCulture] = useState("");
  const [refPhase, setRefPhase] = useState(-1);
  const [demandes, setDemandes] = useState([]);
  const [emails, setEmails] = useState(EMAILS_DEFAUT);
  const [doa, setDoa] = useState({});
  const [vueDemande, setVueDemande] = useState("");

  const ACC = bureau === "TOM" ? C.green : bureau === "BAN" ? C.ban : bureau === "AVI" ? C.avi : C.liv;
  const NOM_BUREAU = bureau === "TOM" ? "SERRE" : bureau === "BAN" ? "BANANERAIE"
    : bureau === "AVI" ? "POULAILLER" : "LIVRAISONS";
  const zonesBureau = ZONES[bureau] || [];
  const LIEUX = bureau === "LIV" ? LIEUX_LIV : [...zonesBureau, ...HORS_CULTURE];
  const cle = `dt:${bureau}:${date}`;
  const dateLibelle = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  const flash = (m, ms) => { setEtat(m); setTimeout(() => setEtat(""), ms || 3000); };
  const storage = window.storage ?? {
    get: async (key) => {
      const cached = window.localStorage.getItem(key);
      try {
        const r = await fetch(`/api/carnet-storage/value?key=${encodeURIComponent(key)}`, { headers: { "X-DTomate-Site-Code": codeSite } });
        if (r.ok) { const d = await r.json(); if (d.value !== null) { window.localStorage.setItem(key, d.value); return { value: d.value }; } }
      } catch { /* le cache local permet de travailler hors ligne */ }
      return { value: cached };
    },
    set: async (key, value) => {
      window.localStorage.setItem(key, value);
      const pendingKey = "dtomate:sync-pending";
      const pending = JSON.parse(window.localStorage.getItem(pendingKey) || "{}");
      pending[key] = value;
      window.localStorage.setItem(pendingKey, JSON.stringify(pending));
      try {
        const queue = JSON.parse(window.localStorage.getItem(pendingKey) || "{}");
        for (const [queuedKey, queuedValue] of Object.entries(queue)) {
          const r = await fetch("/api/carnet-storage", { method: "PUT", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": decodeURIComponent(document.cookie.split("; ").find((cookie) => cookie.startsWith("XSRF-TOKEN="))?.slice(11) ?? ""), "X-DTomate-Site-Code": codeSite }, body: JSON.stringify({ key: queuedKey, value: queuedValue }) });
          if (!r.ok) throw new Error("Synchronisation différée");
          delete queue[queuedKey];
        }
        window.localStorage.setItem(pendingKey, JSON.stringify(queue));
      } catch { /* la file locale sera rejouée à la prochaine écriture */ }
      return true;
    },
    list: async (prefix) => {
      const local = Object.keys(window.localStorage).filter((key) => key.startsWith(prefix));
      try {
        const r = await fetch(`/api/carnet-storage?prefix=${encodeURIComponent(prefix)}`, { headers: { "X-DTomate-Site-Code": codeSite } });
        if (r.ok) { const d = await r.json(); return { keys: [...new Set([...local, ...d.keys])] }; }
      } catch { /* le cache local permet de consulter les données hors ligne */ }
      return { keys: local };
    },
  };

  const lire = async (k, def) => {
    try { const r = await storage.get(k, true); return r && r.value ? JSON.parse(r.value) : def; }
    catch { return def; }
  };
  const ecrire = async (k, v) => {
    try { await storage.set(k, JSON.stringify(v), true); return true; } catch { return false; }
  };
  /* Rien n'est jamais jeté : ce qui dépasse la fenêtre de consultation part
     dans une archive mensuelle, relue par les exports et les sauvegardes. */
  const archiver = async (base, surplus) => {
    if (!surplus.length) return;
    const parMois = {};
    surplus.forEach((e) => {
      const d = (e.t || e.date || auj()).slice(0, 7);
      (parMois[d] = parMois[d] || []).push(e);
    });
    for (const mois of Object.keys(parMois)) {
      const k = `${base}:arch:${mois}`;
      const dejala = await lire(k, []);
      await ecrire(k, [...parMois[mois], ...dejala]);
    }
  };
  const poser = async (base, liste, garder, setter) => {
    const vivant = liste.slice(0, garder);
    const surplus = liste.slice(garder);
    setter(vivant);
    await ecrire(base, vivant);
    await archiver(base, surplus);
  };

  /* ---- démarrage ---- */
  useEffect(() => { (async () => {
    setCodes(await lire("dt:acces:codes", {}));
    const cs = await lire("dt:acces:site", null);
    if (cs) setCodeSite(cs); else await ecrire("dt:acces:site", CODE_SITE_DEFAUT);
    let cu = await lire("dt:reg:cultures", null);
    if (!cu) { cu = CULTURES_INITIALES; if (auth?.user?.role === "direction") await ecrire("dt:reg:cultures", cu); }
    setCultures(cu);
    /* Fusion du catalogue : les articles déjà connus gardent leur stock, leur
       prix et leur seuil ; seuls les articles nouveaux de cette version sont
       ajoutés. Aucun article existant n'est supprimé, même s'il a disparu du
       catalogue livré. */
    let ar = await lire("dt:stock:articles", null);
    if (!ar) { ar = ARTICLES_INITIAUX; }
    else {
      const connus = ar.map((a) => a.id);
      const ajouts = ARTICLES_INITIAUX.filter((a) => connus.indexOf(a.id) < 0);
      if (ajouts.length) ar = [...ar, ...ajouts];
    }
    await ecrire("dt:stock:articles", ar);
    setArticles(ar);
    /* Trace des versions successives : on sait toujours quelle version a écrit quoi. */
    const meta = await lire("dt:meta", null);
    const m = meta || { schema: SCHEMA, premiere: auj(), versions: [] };
    if (!m.versions.some((v) => v.version === APP_VERSION))
      m.versions = [{ version: APP_VERSION, depuis: auj() }, ...m.versions];
    m.schema = SCHEMA; m.derniere = auj();
    await ecrire("dt:meta", m); setMeta(m);
    setArchives(await lire("dt:reg:archives", []));
    // Les dernières exécutions proviennent du serveur et de ses preuves, pas des anciens clics FAIT.
    setDar(await lire("dt:reg:dar", {}));
    setCendres(await lire("dt:reg:cendres", {}));
    setJournal(await lire("dt:journal", []));
    setMouvements(await lire("dt:stock:mouvements", []));
    setLots(await lire("dt:lots", []));
    setRegimes(await lire("dt:regimes", []));
    setCumul(await lire("dt:reg:cumul", {}));
    setTraitZone(await lire("dt:reg:traitzone", {}));
    setMesuresH(await lire("dt:mesures", []));
    setDemandes(await lire("dt:demandes", []));
    setEmails(await lire("dt:acces:emails", EMAILS_DEFAUT));
    setDoa(await lire("dt:acces:doa", {}));
  })(); }, []);

  const noter = async (action, detail) => {
    const e = { t: `${auj()} ${heure()}`, agent: courtNom(agent), bureau, action, detail: detail || "" };
    await poser("dt:journal", [e, ...journal], 400, setJournal);
  };

  const vider = () => { setMeteo(""); setPresence([]); setTravaux([]); setEngrais([]); setPhyto([]);
    setMesures([]); setRecoltes([]); setGainage([]); setLivraisons([]); setProblemes([]); setTachesFaites([]);
    setAlimentation([]); setPonte([]); setSante([]); setCheptel([]); };

  useEffect(() => { if (etape !== "ok") return; (async () => {
    const d = await lire(cle, null);
    if (d) {
      setMeteo(d.meteo || ""); setPresence(d.presence || []); setTravaux(d.travaux || []);
      setEngrais(d.engrais || []); setPhyto(d.phyto || []); setMesures(d.mesures || []);
      setRecoltes(d.recoltes || []); setGainage(d.gainage || []); setLivraisons(d.livraisons || []);
      setProblemes(d.problemes || []); setTachesFaites(d.tachesFaites || []);
      setAlimentation(d.alimentation || []); setPonte(d.ponte || []);
      setSante(d.sante || []); setCheptel(d.cheptel || []);
      const ph = [...(d.problemes || []).flatMap((p) => p.photos || []),
        ...(d.recoltes || []).flatMap((r) => r.photos || [])];
      const im = {};
      for (const id of ph) { const v = await lire(`dt:photo:${id}`, null); if (v) im[id] = v; }
      setImages((x) => ({ ...x, ...im }));
    } else vider();
  })(); }, [date, bureau, etape]);

  const sauver = async (next) => {
    const d = { meteo, presence, travaux, engrais, phyto, mesures, recoltes, gainage,
      livraisons, problemes, tachesFaites, alimentation, ponte, sante, cheptel, bureau, ...next };
    flash(await ecrire(cle, d) ? "Enregistré à " + heure() : "Échec de l'enregistrement — réessayez");
  };

  /* ---- photos ---- */
  const compresser = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/jpeg", 0.55));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
  const ajouterPhoto = async (file, setter, liste) => {
    try {
      const b64 = await compresser(file);
      const id = uid("IMG");
      await ecrire(`dt:photo:${id}`, b64);
      setImages((x) => ({ ...x, [id]: b64 }));
      setter([...liste, id]);
      flash("Photo enregistrée");
    } catch { flash("Photo impossible à traiter"); }
  };

  /* ---- accès ---- */
  const validerSite = () => {
    if (saisieSite.trim() !== codeSite) { setErreurAcces("Code de site incorrect."); return; }
    window.localStorage.setItem("dtomate:access:site-approved", codeSite);
    setErreurAcces(""); setSaisieSite(""); setEtape("agent");
  };
  const validerAgent = async () => {
    const enregistre = codes[agent], c = saisieCode.trim();
    if (!agent) { setErreurAcces("Choisissez votre nom."); return; }
    if (!/^\d{4}$/.test(c)) { setErreurAcces("Le code personnel fait 4 chiffres."); return; }
    if (!enregistre) { const n = { ...codes, [agent]: c }; setCodes(n); await ecrire("dt:acces:codes", n); }
    else if (enregistre !== c) { setErreurAcces("Code personnel incorrect."); return; }
    window.localStorage.setItem("dtomate:access:agent", agent);
    setErreurAcces(""); setSaisieCode(""); setEtape("ok");
    const e = { t: `${auj()} ${heure()}`, agent: courtNom(agent), bureau: "—", action: "Connexion", detail: "" };
    const j = [e, ...journal].slice(0, 600); setJournal(j); ecrire("dt:journal", j);
  };
  const deconnecter = () => { window.localStorage.removeItem("dtomate:access:site-approved"); window.localStorage.removeItem("dtomate:access:agent"); setAgent(""); setEtape("site"); setOnglet("accueil"); setSousPage(""); };

  /* ═══════════ FORMULAIRES ═══════════ */
  const vTv = { zone: "", tache: "", qte: "", unite: "plants", qui: "", quiManuel: "", personnes: 1, heures: 4 };
  const vEn = { bac: "", zone: "", volume: "", qui: "", quiManuel: "", cendreRecente: "", horsPlan: "", produitsManquants: "" };
  const vPh = { zone: "", volume: "", cible: "", qui: "", quiManuel: "", dar: "", horsPlan: "" };
  const vMs = { id: "", valeur: "", zone: "" };
  const vRc = { zone: "", kg: "", regimes: "", ecart: "", motif: "", qualite: "", caisses: "", photos: [] };
  const vGa = { zone: "", nb: "", couleur: "", bourgeon: "" };
  const vLv = { bl: "", client: "", produit: "", lot: "", caisses: "", kg: "", pu: "", receptionnaire: "", signe: "", h: "" };
  const vPb = { ou: "", quoi: "", gravite: "", photos: [] };
  const vCu = { zone: "", type: "", debut: "", effectif: "", note: "" };
  const vAl = { zone: "", articleId: "", kg: "", eau: "", transition: "", qui: "", quiManuel: "" };
  const vPo = { zone: "", oeufs: "", sales: "", casses: "", ramassages: 3, qui: "", quiManuel: "" };
  const vSa = { zone: "", type: "", articleId: "", etiquette: "", sujets: "", qte: "", delai: "", qui: "", quiManuel: "" };
  const vCh = { zone: "", morts: "", cause: "", naissances: "", sorties: "", kg: "", poidsMoyen: "" };
  const vAr = { id: "", qte: "", motif: "", prix: "", peremption: "" };
  const vNa = { nom: "", cat: "", unite: "", seuil: "", prix: "" };
  const vSo = { id: "", qte: "", motif: "", zone: "" };
  const vCo = { id: "", compte: "" };
  const vDe = { type: "", objet: "", articleId: "", qte: "", unite: "", montant: "", centre: "",
    motif: "", urgence: "", specification: "" };

  const [tv, setTv] = useState(vTv);
  const [en, setEn] = useState(vEn);
  const [ph, setPh] = useState(vPh);
  const [ms, setMs] = useState(vMs);
  const [rc, setRc] = useState(vRc);
  const [ga, setGa] = useState(vGa);
  const [lv, setLv] = useState(vLv);
  const [pb, setPb] = useState(vPb);
  const [cu, setCu] = useState(vCu);
  const [ar, setAr] = useState(vAr);
  const [al, setAl] = useState(vAl);
  const [po, setPo] = useState(vPo);
  const [sa, setSa] = useState(vSa);
  const [ch, setCh] = useState(vCh);
  const [na, setNa] = useState(vNa);
  const [so, setSo] = useState(vSo);
  const [co, setCo] = useState(vCo);
  const [de, setDe] = useState(vDe);
  const [decision, setDecision] = useState({});
  const [ligneE, setLigneE] = useState({ articleId: "", dose: "", qte: "" });
  const [melangeE, setMelangeE] = useState([]);
  const [ligneP, setLigneP] = useState({ articleId: "", etiquette: "", dose: "", qte: "" });
  const [melangeP, setMelangeP] = useState([]);
  const [nouveauSite, setNouveauSite] = useState("");
  const [coupe, setCoupe] = useState({});

  const art = (id) => articles.find((a) => a.id === id) || null;
  const nomArt = (id) => (art(id) || { nom: id }).nom;
  const libelleArticle = (a) => a.id === "ENG02" && a.nom.startsWith("Multi-K")
    ? `Nitrate de potassium — ${a.nom}` : a.nom;
  const optArticles = (cat) => articles.filter((a) => (cat ? a.cat === cat : true))
    .map((a) => ({ v: a.id, t: `${libelleArticle(a)} — stock ${a.stock} ${a.unite}` }));
  const cultureDe = (z) => (cultures[z] ? cultures[z].type : "");
  const ageDe = (z) => (cultures[z] ? jours(cultures[z].debut, date) : null);
  /* n'affiche que les intrants autorisés pour la spéculation de la zone */
  const articlesPour = (zone, cat) => {
    const t = cultureDe(zone);
    const aut = t && INTRANTS_AUTORISES[t] ? INTRANTS_AUTORISES[t][cat] : null;
    const l = articles.filter((a) => a.cat === cat && (!aut || aut.indexOf(a.id) >= 0));
    return (l.length ? l : articles.filter((a) => a.cat === cat))
      .map((a) => ({ v: a.id, t: `${libelleArticle(a)} — stock ${a.stock} ${a.unite}` }));
  };
  /* n'affiche que les tâches qui vont avec l'atelier choisi */
  const tachesPour = (zone) => {
    const t = cultureDe(zone);
    if (t && TACHES_PAR_CULTURE[t]) return TACHES_PAR_CULTURE[t];
    if (zone && HORS_CULTURE.indexOf(zone) >= 0) return TACHES_HORS_CULTURE;
    return TACHES_LIBRES[bureau] || TACHES_HORS_CULTURE;
  };
  const unitesPour = (tache) => UNITES_PAR_TACHE[tache] || UNITES_TOUTES;
  const alimentDuJour = (zone) => {
    const t = cultureDe(zone), j = ageDe(zone);
    if (!t || !ALIMENT_PAR_AGE[t] || j === null) return null;
    return ALIMENT_PAR_AGE[t].find((x) => j >= x.min && j <= x.max) || null;
  };
  const nomAgent = (o) => (o.qui === "Autre — écrire le nom" ? (o.quiManuel || "non précisé") : courtNom(o.qui));
  const org = (a) => HIERARCHIE[a] || { role: "Agent", superieur: "", plafond: 0 };
  const plafondDe = (a) => (doa[a] !== undefined ? num(doa[a]) : org(a).plafond);
  const superieurDe = (a) => org(a).superieur;
  const emailDe = (a) => (emails[a] || "").trim();
  const monRole = org(agent).role;
  const monPlafond = plafondDe(agent);
  const emailSuperieur = emailDe(superieurDe(agent));
  const centreAuto = (z) => centreDeZone(z);
  const envoyerMail = (dest, cc, sujet, corps, libelle) => {
    if (!dest) { flash("Adresse e-mail manquante. La Direction doit la renseigner dans Registres → Accès.", 6000); return; }
    noter("Envoi e-mail", libelle);
    window.location.href = `mailto:${dest}${cc ? `?cc=${cc}&` : "?"}subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };
  const envoyerWhatsApp = (corps, libelle) => {
    noter("Envoi WhatsApp", libelle);
    window.open(`https://wa.me/?text=${encodeURIComponent(corps)}`, "_blank");
  };

  /* ═══════════ STOCK ═══════════ */
  const appliquerSorties = async (lignes, zone, motif) => {
    let next = [...articles], mv = [...mouvements], cout = 0;
    for (const l of lignes) {
      const q = num(l.qte); if (!l.articleId || !q) continue;
      const i = next.findIndex((a) => a.id === l.articleId); if (i < 0) continue;
      const a = next[i];
      next[i] = { ...a, stock: Math.round((a.stock - q) * 1000) / 1000 };
      cout += q * num(a.prix);
      mv = [{ t: `${date} ${heure()}`, type: "Sortie", articleId: a.id, nom: a.nom, qte: q,
        unite: a.unite, motif, zone, agent: courtNom(agent) }, ...mv];
    }
    setArticles(next);
    await ecrire("dt:stock:articles", next);
    await poser("dt:stock:mouvements", mv, 500, setMouvements);
    return Math.round(cout * 100) / 100;
  };
  const entreeStock = async () => {
    const a = art(ar.id);
    if (!a || !num(ar.qte)) { flash("Choisissez un article et une quantité", 4000); return; }
    const next = articles.map((x) => x.id === a.id ? {
      ...x, stock: Math.round((x.stock + num(ar.qte)) * 1000) / 1000,
      prix: num(ar.prix) ? num(ar.prix) : x.prix,
      peremption: ar.peremption || x.peremption } : x);
    const mv = [{ t: `${date} ${heure()}`, type: "Entrée", articleId: a.id, nom: a.nom, qte: num(ar.qte),
      unite: a.unite, motif: ar.motif || "Réception", zone: "Magasin", agent: courtNom(agent) }, ...mouvements];
    setArticles(next);
    await ecrire("dt:stock:articles", next);
    await poser("dt:stock:mouvements", mv, 500, setMouvements);
    noter("Entrée en stock", `${a.nom} — ${ar.qte} ${a.unite}`);
    setAr(vAr); flash("Entrée enregistrée");
  };
  const creerArticle = async () => {
    if (!na.nom || !na.cat || !na.unite) { flash("Nom, catégorie et unité sont obligatoires", 4000); return; }
    const prefixe = na.cat.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const n = articles.filter((a) => a.id.indexOf(prefixe) === 0).length + 1;
    const id = `${prefixe}${String(n).padStart(2, "0")}`;
    const art0 = { id, nom: na.nom, cat: na.cat, unite: na.unite, seuil: num(na.seuil),
      prix: num(na.prix), stock: 0, peremption: "" };
    const next = [...articles, art0];
    setArticles(next); await ecrire("dt:stock:articles", next);
    noter("Article créé", `${id} — ${na.nom}`);
    setNa(vNa); flash(`Article ${id} créé`);
  };
  const sortieManuelle = async () => {
    const a = art(so.id);
    if (!a || !num(so.qte)) { flash("Choisissez un article et une quantité", 4000); return; }
    if (!so.motif) { flash("Le motif de sortie est obligatoire", 4000); return; }
    if (num(so.qte) > a.stock) { flash(`Stock insuffisant : il ne reste que ${a.stock} ${a.unite}.`, 5000); return; }
    await appliquerSorties([{ articleId: a.id, qte: num(so.qte) }], so.zone, `Sortie manuelle — ${so.motif}`);
    noter("Sortie de stock", `${a.nom} — ${so.qte} ${a.unite} — ${so.motif}`);
    setSo(vSo); flash("Sortie enregistrée");
  };
  const comptagePhysique = async () => {
    const a = art(co.id);
    if (!a || co.compte === "") { flash("Choisissez un article et saisissez la quantité comptée", 4000); return; }
    const ecart = Math.round((num(co.compte) - a.stock) * 1000) / 1000;
    const next = articles.map((x) => x.id === a.id ? { ...x, stock: num(co.compte) } : x);
    const mv = [{ t: `${date} ${heure()}`, type: ecart >= 0 ? "Entrée" : "Sortie", articleId: a.id, nom: a.nom,
      qte: Math.abs(ecart), unite: a.unite,
      motif: `Comptage physique — théorique ${a.stock}, compté ${co.compte}, écart ${ecart > 0 ? "+" : ""}${ecart}`,
      zone: "Magasin", agent: courtNom(agent) }, ...mouvements];
    setArticles(next);
    await ecrire("dt:stock:articles", next);
    await poser("dt:stock:mouvements", mv, 500, setMouvements);
    noter("Comptage physique", `${a.nom} — écart ${ecart > 0 ? "+" : ""}${ecart} ${a.unite}`);
    if (Math.abs(ecart) > 0) {
      const pr = [...problemes, { ou: "Magasin", quoi: `Écart d'inventaire sur ${a.nom} : ${ecart > 0 ? "+" : ""}${ecart} ${a.unite}`,
        gravite: Math.abs(ecart * a.prix) > 20 ? "Urgent — prévenir la Direction aujourd'hui" : "À surveiller", photos: [] }];
      setProblemes(pr); sauver({ problemes: pr });
    }
    setCo(vCo); flash(`Écart de ${ecart > 0 ? "+" : ""}${ecart} ${a.unite} enregistré`);
  };

  const majArticle = async (id, champ, valeur) => {
    const next = articles.map((x) => x.id === id ? { ...x, [champ]: champ === "peremption" ? valeur : num(valeur) } : x);
    setArticles(next); await ecrire("dt:stock:articles", next);
  };
  /* Un article n'est « actif » que s'il est réellement entré dans la vie du magasin :
     du stock, un prix, ou au moins un mouvement. Les 56 lignes du catalogue jamais
     approvisionnées ne déclenchent aucune alerte — sinon tout sonne et plus rien n'est lu. */
  const aBouge = (id) => mouvements.some((m) => m.articleId === id);
  const estActif = (a) => a.stock > 0 || a.prix > 0 || aBouge(a.id);
  const articlesActifs = articles.filter(estActif);
  const nonReferences = articles.filter((a) => !estActif(a));
  const rupture = articlesActifs.filter((a) => a.stock <= 0);
  const sousSeuil = articlesActifs.filter((a) => a.seuil > 0 && a.stock > 0 && a.stock < a.seuil);
  const perimeBientot = articles.filter((a) => a.peremption && jours(date, a.peremption) <= ALERTE_PEREMPTION);
  const valeurStock = articles.reduce((s, a) => s + a.stock * a.prix, 0);
  const sansPrix = articlesActifs.filter((a) => a.stock > 0 && !a.prix);
  const alertesStock = rupture.length + sousSeuil.length + perimeBientot.length;

  /* ═══════════ CUMULS ═══════════ */
  const majCumul = async (zone, d) => {
    const c = { kg: 0, ecart: 0, coutIntrant: 0, coutMO: 0, heures: 0, oeufs: 0, oeufsPerdus: 0,
      morts: 0, aliment: 0, sujets: 0, ...(cumul[zone] || {}) };
    const n = { ...cumul, [zone]: {
      kg: Math.round((c.kg + (d.kg || 0)) * 100) / 100,
      ecart: Math.round((c.ecart + (d.ecart || 0)) * 100) / 100,
      coutIntrant: Math.round((c.coutIntrant + (d.coutIntrant || 0)) * 100) / 100,
      coutMO: Math.round((c.coutMO + (d.coutMO || 0)) * 100) / 100,
      heures: Math.round((c.heures + (d.heures || 0)) * 10) / 10,
      oeufs: c.oeufs + (d.oeufs || 0), oeufsPerdus: c.oeufsPerdus + (d.oeufsPerdus || 0),
      morts: c.morts + (d.morts || 0), sujets: c.sujets + (d.sujets || 0),
      aliment: Math.round((c.aliment + (d.aliment || 0)) * 100) / 100 } };
    setCumul(n); await ecrire("dt:reg:cumul", n);
  };

  /* ═══════════ CONTRÔLES ═══════════ */
  const sacsInterdits = gainage.filter((g) => g.couleur.includes("INTERDIT")).reduce((s, g) => s + num(g.nb), 0);
  const totalKg = recoltes.reduce((s, r) => s + num(r.kg), 0);
  const totalEcart = recoltes.reduce((s, r) => s + num(r.ecart), 0);
  const tauxPerte = totalKg + totalEcart > 0 ? Math.round((totalEcart / (totalKg + totalEcart)) * 100) : 0;
  const totalLivKg = livraisons.reduce((s, l) => s + num(l.kg), 0);
  const totalLivUsd = livraisons.reduce((s, l) => s + num(l.kg) * num(l.pu), 0);
  const caissesLourdes = livraisons.filter((l) => num(l.caisses) > 0 && num(l.kg) / num(l.caisses) > POIDS_CAISSE_MAX);
  const darActif = (z) => (dar[z] && dar[z] > date ? dar[z] : "");
  const totalOeufs = ponte.reduce((s, x) => s + num(x.oeufs), 0);
  const totalCasses = ponte.reduce((s, x) => s + num(x.casses), 0);
  const totalSales = ponte.reduce((s, x) => s + num(x.sales), 0);
  const totalMorts = cheptel.reduce((s, x) => s + num(x.morts), 0);
  const totalAliment = alimentation.reduce((s, x) => s + num(x.kg), 0);
  const effectifAvi = ZONES.AVI.reduce((s, z) => s + (cultures[z] ? num(cultures[z].effectif) : 0), 0);
  const tauxPonte = effectifAvi > 0 && totalOeufs > 0
    ? Math.round(((totalOeufs + totalCasses + totalSales) / effectifAvi) * 100) : null;
  const alimentHorsAge = (() => {
    const rec = alimentDuJour(al.zone);
    return !!(rec && al.articleId && al.articleId !== rec.article);
  })();
  const coutMOjour = presence.filter((p) => p.statut === "Présent")
    .reduce((s, p) => s + (num(p.heures) / 8) * tauxDe(p.agent), 0);
  const mesureHorsNorme = (m) => {
    const d = MESURES.find((x) => x.id === m.id); if (!d) return false;
    return num(m.valeur) < d.min || num(m.valeur) > d.max;
  };

  /* ═══ Contrôle agronomique permanent : retards, actions manquées, actions anticipées ═══ */
  const CAT_ACTION = { Fertigation: ["Fertigation", "Fertilisation"], Fertilisation: ["Fertilisation", "Fertigation"],
    Phyto: ["Phyto"], Alimentation: ["Alimentation"], Santé: ["Santé"] };
  const anomaliesZone = (z) => {
    const c = cultures[z]; if (!c) return [];
    const j = jours(c.debut, date), out = [];
    const cat = CULTURES[c.type]; if (!cat) return [];
    for (const t of cat.taches) {
      const k = `${z}|${t.id}`, last = regTaches[k] || "";
      const fin = t.max === undefined ? 99999 : t.max;
      if (t.freq === "unique" && !last && j > fin)
        out.push({ zone: z, gravite: "manquee", texte: `${t.nom} : la fenêtre (J+${t.min || 0} à J+${fin}) est passée et l'action n'a jamais été faite.` });
      if (t.freq === "periode" && j >= (t.min || 0) && j <= fin) {
        const ec = last ? jours(last, date) : j - (t.min || 0);
        if (ec >= t.periode * 2)
          out.push({ zone: z, gravite: "retard", texte: `${t.nom} : ${ec} jours depuis le dernier passage, pour un rythme de ${t.periode} jours.` });
      }
      if (t.freq === "sem" && j >= (t.min || 0) && j <= fin && last && jours(last, date) >= 14)
        out.push({ zone: z, gravite: "retard", texte: `${t.nom} : ${jours(last, date)} jours sans passage, pour un rythme hebdomadaire.` });
    }
    if (c.aConfirmer) out.push({ zone: z, gravite: "donnee", texte: "Date de départ présumée : tout le calendrier de cette zone est approximatif tant qu'elle n'est pas confirmée." });
    if (!num(c.effectif)) out.push({ zone: z, gravite: "donnee", texte: "Effectif non renseigné : aucun rendement ni coût unitaire calculable." });
    return out;
  };
  const anomalies = zonesBureau.filter((z) => cultures[z]).flatMap(anomaliesZone);
  /* une action est « hors calendrier » si aucune tâche de sa famille n'est due
     ni en retard aujourd'hui sur cette zone */
  const horsCalendrier = (z, famille) => {
    const c = cultures[z]; if (!c) return false;
    const cats = CAT_ACTION[famille] || [famille];
    const dues = tachesDues(z, c, date, regTaches, CULTURES).filter((t) => cats.indexOf(t.cat) >= 0 && t.due);
    if (dues.length) return false;
    const cat = CULTURES[c.type];
    const j = jours(c.debut, date);
    const existe = cat && cat.taches.some((t) => cats.indexOf(t.cat) >= 0
      && j >= (t.min || 0) && j <= (t.max === undefined ? 99999 : t.max));
    return existe;
  };

  const conflitBac = () => {
    if (!en.bac.startsWith("Bac")) return "";
    const noms = melangeE.map((m) => nomArt(m.articleId));
    const ca = noms.find((n) => CALCIQUES.some((c) => n.startsWith(c)));
    const an = noms.find((n) => ANTAGONISTES.some((c) => n.includes(c)));
    if (ca && an) return `${ca} et ${an} dans le même bac : le calcium précipite et bouche les goutteurs. Calcium en Bac A, phosphates et sulfates en Bac B.`;
    return "";
  };
  const conflitBouillie = () => {
    const cs = melangeP.map((m) => codeFrac(nomArt(m.articleId))).filter(Boolean);
    const dbl = cs.find((c, i) => cs.indexOf(c) !== i);
    if (dbl) return `Deux produits du groupe ${dbl} dans la même bouillie : aucun gain, et cela fabrique de la résistance.`;
    const noms = melangeP.map((m) => nomArt(m.articleId)).join(" ");
    if (noms.includes("Cuivre") && noms.includes("Soufre")) return "Cuivre et soufre ensemble brûlent le feuillage. Espacez les deux passages de 10 jours.";
    if (melangeP.length > 3) return "Plus de trois matières actives dans un seul passage : risque de phytotoxicité.";
    return "";
  };
  const cendreProche = en.zone && cendres[en.zone] && jours(cendres[en.zone], date) < DELAI_CENDRE_UREE ? cendres[en.zone] : "";
  const melangeAzote = melangeE.some((m) => { const n = nomArt(m.articleId); return n.startsWith("Urée") || n.startsWith("Sulfate d'ammonium"); });

  /* ═══════════ ACTIONS ═══════════ */
  const ajouter = (erreur, liste, set, champ, item, reset, libelle) => {
    if (erreur) { flash(erreur, 4500); return; }
    const n = [...liste, item]; set(n); sauver({ [champ]: n }); reset(); noter("Ajout", libelle);
  };
  const retirer = (liste, set, i, champ, libelle) => {
    const n = liste.filter((_, k) => k !== i); set(n); sauver({ [champ]: n }); noter("Retrait", libelle);
  };
  const marquerTache = () => {
    window.location.assign(`/taches?date=${encodeURIComponent(date)}`);
  };
  const installerCulture = async () => {
    if (auth?.user?.role !== "direction") { flash("Seule la direction peut modifier le registre des cultures.", 5000); return; }
    if (!cu.zone || !cu.type || !cu.debut) { flash("Zone, culture et date de départ sont obligatoires", 4000); return; }
    if (cultures[cu.zone]) { flash("Cette zone porte déjà une culture. Clôturez d'abord le cycle en cours.", 5000); return; }
    const n = { ...cultures, [cu.zone]: { type: cu.type, debut: cu.debut, effectif: cu.effectif, note: cu.note, aConfirmer: false } };
    setCultures(n); await ecrire("dt:reg:cultures", n);
    const cm = { ...cumul }; delete cm[cu.zone]; setCumul(cm); await ecrire("dt:reg:cumul", cm);
    noter("Culture installée", `${cu.zone} — ${cu.type} — départ ${cu.debut}`);
    setCu(vCu); flash("Culture installée, compteurs remis à zéro");
  };
  const cloturerCulture = async (zone) => {
    if (auth?.user?.role !== "direction") { flash("Seule la direction peut modifier le registre des cultures.", 5000); return; }
    const c = cultures[zone]; if (!c) return;
    const cm = cumul[zone] || {};
    const a = [{ zone, ...c, fin: date, par: courtNom(agent), bilan: cm }, ...archives];
    const n = { ...cultures }; delete n[zone];
    const rt = { ...regTaches }; Object.keys(rt).forEach((k) => { if (k.startsWith(zone + "|")) delete rt[k]; });
    setArchives(a); setCultures(n); setRegTaches(rt);
    await ecrire("dt:reg:archives", a); await ecrire("dt:reg:cultures", n); await ecrire("dt:reg:taches", rt);
    noter("Cycle clôturé", `${zone} — ${c.type}`);
    flash(`${zone} : cycle clôturé, la zone est libre`);
  };
  const confirmerDate = async (zone, d) => {
    if (auth?.user?.role !== "direction") { flash("Seule la direction peut modifier le registre des cultures.", 5000); return; }
    const n = { ...cultures, [zone]: { ...cultures[zone], debut: d, aConfirmer: false } };
    setCultures(n); await ecrire("dt:reg:cultures", n);
    noter("Date confirmée", `${zone} — départ ${d}`); flash("Date de départ confirmée");
  };

  const enregistrerEngrais = async () => {
    const produitsManquants = en.produitsManquants.trim();
    if (!melangeE.length && !produitsManquants) { flash("Ajoutez un produit appliqué ou indiquez les produits manquants", 4000); return; }
    if (!en.bac || !en.zone) { flash("Bac et zone sont obligatoires", 4000); return; }
    const cf = conflitBac(); if (cf) { flash(cf, 7000); return; }
    if (melangeE.length && horsCalendrier(en.zone, "Fertigation") && (!en.horsPlan || en.horsPlan.startsWith("Non"))) {
      flash("Apport hors calendrier : confirmez la raison, ou revenez au plan.", 6000); return; }
    if (melangeAzote && cendreProche) { flash(`INTERDIT : cendres épandues le ${cendreProche} sur ${en.zone}. Attendez ${DELAI_CENDRE_UREE} jours avant l'azote.`, 7000); return; }
    if (melangeAzote && en.cendreRecente === "Oui — moins de 14 jours") { flash("INTERDIT : azote sur cendres fraîches. Prévenez la Direction.", 6000); return; }
    if (melangeE.some((m) => nomArt(m.articleId) === "Cendre de bois")) {
      const n = { ...cendres, [en.zone]: date }; setCendres(n); await ecrire("dt:reg:cendres", n);
    }
    const cout = await appliquerSorties(melangeE, en.zone, `Fertilisation ${en.bac}`);
    await majCumul(en.zone, { coutIntrant: cout });
    const item = { ...en, produitsManquants, centre: centreAuto(en.zone),
      produits: melangeE.map((m) => ({ ...m, nom: nomArt(m.articleId) })), cout, par: nomAgent(en) };
    const n = [...engrais, item]; setEngrais(n); sauver({ engrais: n });
    noter("Fertilisation", `${en.zone} — ${en.bac} — ${usd(cout)} ${DEVISE}${produitsManquants ? ` — MANQUEMENT : ${produitsManquants}` : ""}`);
    setEn(vEn); setMelangeE([]);
  };
  const enregistrerPhyto = async () => {
    if (!melangeP.length) { flash("Ajoutez au moins un produit à la bouillie", 4000); return; }
    if (!ph.zone) { flash("La zone traitée est obligatoire", 4000); return; }
    const cf = conflitBouillie(); if (cf) { flash(cf, 7000); return; }
    if (horsCalendrier(ph.zone, "Phyto") && (!ph.horsPlan || ph.horsPlan.startsWith("Non"))) {
      flash("Traitement hors calendrier : confirmez la raison, ou revenez au plan.", 6000); return; }
    if (ph.dar) { const n = { ...dar, [ph.zone]: ph.dar }; setDar(n); await ecrire("dt:reg:dar", n); }
    const noms = melangeP.map((m) => `${nomArt(m.articleId)} ${m.dose}`);
    const tz = { ...traitZone, [ph.zone]: [{ date, produits: noms, dar: ph.dar, cible: ph.cible },
      ...(traitZone[ph.zone] || [])].slice(0, 24) };
    setTraitZone(tz); await ecrire("dt:reg:traitzone", tz);
    const cout = await appliquerSorties(melangeP, ph.zone, "Traitement phytosanitaire");
    await majCumul(ph.zone, { coutIntrant: cout });
    const item = { ...ph, centre: centreAuto(ph.zone),
      produits: melangeP.map((m) => ({ ...m, nom: nomArt(m.articleId) })), cout, par: nomAgent(ph) };
    const n = [...phyto, item]; setPhyto(n); sauver({ phyto: n });
    noter("Traitement", `${ph.zone} — ${noms.join(" + ")}`);
    setPh(vPh); setMelangeP([]);
  };
  const enregistrerTravail = async () => {
    if (!tv.zone || !tv.tache || !tv.qte) { flash("Zone, tâche et quantité sont obligatoires", 4000); return; }
    const h = num(tv.personnes) * num(tv.heures);
    const cout = Math.round(h * (tauxDe(tv.qui) / 8) * 100) / 100;
    const item = { ...tv, coutMO: cout, centre: centreAuto(tv.zone), par: nomAgent(tv) };
    const n = [...travaux, item]; setTravaux(n); sauver({ travaux: n });
    if (cultures[tv.zone]) await majCumul(tv.zone, { coutMO: cout, heures: h });
    noter("Travail", `${tv.zone} — ${tv.tache} — ${usd(cout)} ${DEVISE} de main-d'œuvre`);
    setTv(vTv);
  };
  const enregistrerMesure = () => {
    if (!ms.id || ms.valeur === "") { flash("Choisissez la mesure et sa valeur", 4000); return; }
    const d = MESURES.find((x) => x.id === ms.id);
    const item = { ...ms, nom: d.nom, unite: d.unite, par: courtNom(agent), h: heure() };
    const n = [...mesures, item]; setMesures(n); sauver({ mesures: n });
    poser("dt:mesures", [{ date, bureau, ...item }, ...mesuresH], 300, setMesuresH);
    noter("Mesure", `${d.nom} : ${ms.valeur} ${d.unite}${mesureHorsNorme(ms) ? " — HORS NORME" : ""}`);
    setMs(vMs);
  };

  const enregistrerRecolte = async () => {
    if (darActif(rc.zone)) { flash(`Récolte interdite sur ${rc.zone} jusqu'au ${darActif(rc.zone)}`, 6000); return; }
    if (!rc.zone || !num(rc.kg)) { flash("Zone et kilos retenus sont obligatoires", 4000); return; }
    if (num(rc.ecart) > 0 && !rc.motif) { flash("Indiquez pourquoi ces kilos ont été écartés", 4000); return; }
    const c = cultures[rc.zone];
    const idLot = `LOT-${date.replace(/-/g, "")}-${rc.zone.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}-${(lots.filter((l) => l.date === date).length + 1)}`;
    const lot = { id: idLot, date, zone: rc.zone, culture: c ? c.type : "", jat: c ? jours(c.debut, date) : null,
      kg: num(rc.kg), ecart: num(rc.ecart), motif: rc.motif, qualite: rc.qualite, caisses: num(rc.caisses),
      regimes: num(rc.regimes), photos: rc.photos,
      traitements: (traitZone[rc.zone] || []).filter((t) => jours(t.date, date) <= 60),
      restant: num(rc.kg), sorties: [], par: courtNom(agent) };
    const nl = [lot, ...lots]; setLots(nl); await ecrire("dt:lots", nl);
    await majCumul(rc.zone, { kg: num(rc.kg), ecart: num(rc.ecart) });
    const item = { ...rc, lot: idLot };
    const n = [...recoltes, item]; setRecoltes(n); sauver({ recoltes: n });
    noter("Récolte", `${rc.zone} — ${rc.kg} kg — ${idLot}`);
    setRc(vRc); flash(`Lot ${idLot} créé`);
  };

  const enregistrerGainage = async () => {
    if (!ga.zone || !num(ga.nb) || !ga.couleur) { flash("Parc, nombre et couleur du sac sont obligatoires", 4000); return; }
    const item = { ...ga, ruban: rubanDe(date) };
    const n = [...gainage, item]; setGainage(n); sauver({ gainage: n });
    if (!ga.couleur.includes("INTERDIT")) {
      const c = cultures[ga.zone];
      const dl = c && CULTURES[c.type] && CULTURES[c.type].delaiCoupe ? CULTURES[c.type].delaiCoupe : 70;
      const ex = regimes.find((r) => r.parc === ga.zone && r.date === date);
      let nr;
      if (ex) nr = regimes.map((r) => r === ex ? { ...r, nb: r.nb + num(ga.nb) } : r);
      else nr = [{ id: uid("REG"), parc: ga.zone, date, ruban: rubanDe(date), nb: num(ga.nb),
        prevision: plusJours(date, dl), coupes: 0,
        poids: c && CULTURES[c.type] ? (CULTURES[c.type].poidsRegime || 18) : 18 }, ...regimes];
      setRegimes(nr); await ecrire("dt:regimes", nr);
    }
    await appliquerSorties([{ articleId: "EMB01", qte: num(ga.nb) }], ga.zone, "Gainage des régimes");
    noter("Gainage", `${ga.zone} — ${ga.nb} régimes — ruban ${rubanDe(date)}`);
    setGa(vGa);
  };
  const marquerCoupe = async (id) => {
    const q = num(coupe[id]); if (!q) { flash("Indiquez combien de régimes ont été coupés", 4000); return; }
    const nr = regimes.map((r) => r.id === id ? { ...r, coupes: Math.min(r.nb, r.coupes + q) } : r);
    setRegimes(nr); await ecrire("dt:regimes", nr);
    setCoupe({ ...coupe, [id]: "" });
    noter("Régimes coupés", `${q} régime(s)`);
    flash(`${q} régime(s) marqués coupés`);
  };

  const enregistrerAliment = async () => {
    if (!al.zone || !al.articleId || !num(al.kg)) { flash("Bâtiment, aliment et quantité sont obligatoires", 4000); return; }
    if (alimentHorsAge && al.transition !== "Oui — transition progressive sur 3 jours") {
      flash("Aliment non conforme à l'âge. Corrigez l'aliment, ou déclarez une transition progressive.", 6000); return;
    }
    const cout = await appliquerSorties([{ articleId: al.articleId, qte: num(al.kg) }], al.zone, "Alimentation volaille");
    await majCumul(al.zone, { coutIntrant: cout, aliment: num(al.kg) });
    const item = { ...al, cout, centre: centreAuto(al.zone), par: nomAgent(al) };
    const n = [...alimentation, item]; setAlimentation(n); sauver({ alimentation: n });
    if (al.eau === "Problème d'eau — signaler") {
      const pr = [...problemes, { ou: al.zone, quoi: "Problème d'eau signalé aux abreuvoirs",
        gravite: "Urgent — prévenir la Direction aujourd'hui", photos: [] }];
      setProblemes(pr); sauver({ alimentation: n, problemes: pr });
    }
    noter("Alimentation", `${al.zone} — ${nomArt(al.articleId)} — ${al.kg} kg`);
    setAl(vAl);
  };
  const enregistrerPonte = async () => {
    if (!po.zone || (!num(po.oeufs) && !num(po.casses) && !num(po.sales))) {
      flash("Bâtiment et nombre d'œufs sont obligatoires", 4000); return; }
    await majCumul(po.zone, { oeufs: num(po.oeufs), oeufsPerdus: num(po.casses) + num(po.sales) });
    const item = { ...po, par: nomAgent(po) };
    const n = [...ponte, item]; setPonte(n); sauver({ ponte: n });
    noter("Ponte", `${po.zone} — ${po.oeufs} œufs propres, ${po.casses} cassés, ${po.sales} sales`);
    setPo(vPo);
  };
  const enregistrerSante = async () => {
    if (!sa.zone || !sa.type || !sa.articleId) { flash("Bâtiment, type et produit sont obligatoires", 4000); return; }
    if (!sa.etiquette) { flash("Recopiez le nom exact écrit sur le flacon", 4000); return; }
    const cout = await appliquerSorties([{ articleId: sa.articleId, qte: num(sa.qte) }], sa.zone, `Santé — ${sa.type}`);
    await majCumul(sa.zone, { coutIntrant: cout });
    if (sa.delai) { const n = { ...dar, [sa.zone]: sa.delai }; setDar(n); await ecrire("dt:reg:dar", n); }
    const item = { ...sa, cout, centre: centreAuto(sa.zone), par: nomAgent(sa) };
    const n = [...sante, item]; setSante(n); sauver({ sante: n });
    noter("Santé animale", `${sa.zone} — ${sa.type} — ${nomArt(sa.articleId)}`);
    setSa(vSa);
  };
  const enregistrerCheptel = async () => {
    if (!ch.zone) { flash("Choisissez le bâtiment", 4000); return; }
    if (num(ch.morts) > 0 && !ch.cause) { flash("Indiquez la cause présumée des mortalités", 4000); return; }
    const c = cultures[ch.zone];
    if (c) {
      const nouveau = Math.max(0, num(c.effectif) + num(ch.naissances) - num(ch.morts) - num(ch.sorties));
      const nc = { ...cultures, [ch.zone]: { ...c, effectif: String(nouveau) } };
      setCultures(nc); await ecrire("dt:reg:cultures", nc);
    }
    await majCumul(ch.zone, { morts: num(ch.morts), kg: num(ch.kg), sujets: num(ch.sorties) });
    const item = { ...ch, par: courtNom(agent) };
    const n = [...cheptel, item]; setCheptel(n); sauver({ cheptel: n });
    noter("Cheptel", `${ch.zone} — ${ch.morts || 0} mort(s), ${ch.naissances || 0} éclosion(s), ${ch.sorties || 0} sortie(s)`);
    setCh(vCh);
  };

  const enregistrerLivraison = async () => {
    const e = !lv.bl ? "Le numéro du bon de livraison est obligatoire"
      : !lv.client || !lv.produit ? "Client et produit sont obligatoires"
      : !num(lv.kg) ? "Le poids livré est obligatoire"
      : !num(lv.pu) ? "Le prix unitaire est obligatoire — un bon sans prix est refusé"
      : !lv.receptionnaire ? "Le nom du réceptionnaire est obligatoire"
      : !lv.signe ? "Indiquez si le bon a été signé" : "";
    if (e) { flash(e, 4500); return; }
    if (lv.lot) {
      const l = lots.find((x) => x.id === lv.lot);
      if (l && num(lv.kg) > l.restant + 0.001) { flash(`Le lot ${l.id} ne contient plus que ${l.restant} kg.`, 5000); return; }
      const nl = lots.map((x) => x.id === lv.lot
        ? { ...x, restant: Math.round((x.restant - num(lv.kg)) * 100) / 100,
            sorties: [...x.sorties, { bl: lv.bl, client: lv.client, kg: num(lv.kg), date }] } : x);
      setLots(nl); await ecrire("dt:lots", nl);
    }
    const n = [...livraisons, lv]; setLivraisons(n); sauver({ livraisons: n });
    noter("Livraison", `BL ${lv.bl} — ${lv.client} — ${lv.kg} kg — ${usd(num(lv.kg) * num(lv.pu))} ${DEVISE}`);
    setLv(vLv);
  };

  /* ═══ RÉQUISITIONS ═══ */
  const ecrireDemandes = async (n) => { setDemandes(n); await ecrire("dt:demandes", n); };
  const montantDemande = (d) => {
    if (num(d.montant)) return num(d.montant);
    const a = art(d.articleId);
    return a ? Math.round(num(d.qte) * a.prix * 100) / 100 : 0;
  };
  const validateurDe = (d) => {
    const sup = superieurDe(d.demandeurCle) || "Christophe LOSEMBE — Direction";
    return montantDemande(d) > plafondDe(sup) ? "Christophe LOSEMBE — Direction" : sup;
  };
  const peutValider = (d) => agent === validateurDe(d) || estDirection(agent);
  const creerDemande = async () => {
    if (!de.type || !de.objet || !de.motif) { flash("Type, objet et motif sont obligatoires", 4500); return; }
    if (de.type === "Sortie de stock" && !de.articleId) { flash("Choisissez l'article demandé", 4000); return; }
    if (de.type === "Demande de caisse" && !num(de.montant)) { flash("Indiquez le montant demandé", 4000); return; }
    if (de.type === "Création d'un nouvel article" && !de.specification) { flash("Décrivez précisément l'article : nom, spécification, unité", 5000); return; }
    if (!de.urgence) { flash("Indiquez le degré d'urgence", 4000); return; }
    const d = { id: `DEM-${date.replace(/-/g, "")}-${String(demandes.length + 1).padStart(3, "0")}`,
      date, ...de, centre: de.centre || centreAuto(de.zone), bureau,
      demandeur: courtNom(agent), demandeurCle: agent, statut: "À valider", historique: [] };
    d.validateur = validateurDe(d);
    await ecrireDemandes([d, ...demandes]);
    noter("Demande créée", `${d.id} — ${d.type} — ${usd(montantDemande(d))} ${DEVISE}`);
    setDe(vDe); setVueDemande(d.id);
    flash(`${d.id} créée — à valider par ${courtNom(d.validateur)}`);
  };
  const traiterDemande = async (id, dec) => {
    const d = demandes.find((x) => x.id === id); if (!d) return;
    if (!peutValider(d) && dec !== "Servie") {
      flash(`Seul ${courtNom(validateurDe(d))} peut se prononcer sur cette demande.`, 5500); return; }
    if (dec === "Refusée" && !decision[id]) { flash("Indiquez le motif du refus", 4000); return; }
    if (dec === "Servie" && d.type === "Sortie de stock") {
      const a = art(d.articleId);
      if (!a) { flash("Article introuvable", 4000); return; }
      if (num(d.qte) > a.stock) { flash(`Stock insuffisant : ${a.stock} ${a.unite} disponibles.`, 5000); return; }
      await appliquerSorties([{ articleId: d.articleId, qte: num(d.qte) }], d.zone || "Magasin", `Demande ${d.id}`);
    }
    if (dec === "Validée" && d.type === "Création d'un nouvel article" && d.specification) {
      const prefixe = "NVX";
      const n = articles.filter((a) => a.id.indexOf(prefixe) === 0).length + 1;
      const art0 = { id: `${prefixe}${String(n).padStart(2, "0")}`, nom: d.objet, cat: "Divers",
        unite: d.unite || "pcs", seuil: 0, prix: num(d.montant), stock: 0, peremption: "" };
      const next = [...articles, art0];
      setArticles(next); await ecrire("dt:stock:articles", next);
      flash(`Article ${art0.id} référencé au catalogue`);
    }
    const n = demandes.map((x) => x.id === id ? { ...x, statut: dec,
      historique: [...(x.historique || []), { par: courtNom(agent), role: monRole, decision: dec,
        date: `${date} ${heure()}`, commentaire: decision[id] || "" }] } : x);
    await ecrireDemandes(n);
    setDecision({ ...decision, [id]: "" });
    noter("Demande " + dec.toLowerCase(), `${id}`);
    flash(`${id} — ${dec}`);
  };
  const texteDemande = (d) => {
    const L = [`DEMANDE ${d.id} — ${d.type}`, ENTITE, SITE, "",
      `Date : ${d.date}`, `Demandeur : ${d.demandeur} (${org(d.demandeurCle).role})`,
      `Section : ${d.bureau}`, `Centre de coûts : ${d.centre} — ${nomCentre(d.centre)}`,
      `Objet : ${d.objet}`];
    if (d.articleId) L.push(`Article : ${nomArt(d.articleId)}`);
    if (num(d.qte)) L.push(`Quantité : ${d.qte} ${d.unite || (art(d.articleId) || {}).unite || ""}`);
    if (d.specification) L.push(`Spécification : ${d.specification}`);
    L.push(`Montant estimé : ${usd(montantDemande(d))} ${DEVISE}`);
    L.push(`Urgence : ${d.urgence}`);
    L.push("", `Motif : ${d.motif}`, "",
      `Validation requise de : ${courtNom(d.validateur)} (plafond ${usd(plafondDe(d.validateur))} ${DEVISE})`,
      `Statut : ${d.statut}`);
    (d.historique || []).forEach((h) => L.push(`  ${h.date} — ${h.par} (${h.role}) : ${h.decision}${h.commentaire ? " — " + h.commentaire : ""}`));
    return L.join("\n");
  };
  const demandesAvalider = demandes.filter((d) => d.statut === "À valider");
  const mesDemandes = demandes.filter((d) => d.demandeurCle === agent);
  const aMonAction = demandes.filter((d) => d.statut === "À valider" && peutValider(d));

  const changerCodeSite = async () => {
    if (!/^\d{4,8}$/.test(nouveauSite)) { flash("Le code de site fait 4 à 8 chiffres", 4000); return; }
    setCodeSite(nouveauSite); await ecrire("dt:acces:site", nouveauSite);
    noter("Code de site changé", ""); setNouveauSite(""); flash("Code changé. Communiquez-le à l'équipe.");
  };
  const revoquerAgent = async (a) => {
    const n = { ...codes }; delete n[a]; setCodes(n); await ecrire("dt:acces:codes", n);
    noter("Code personnel révoqué", courtNom(a)); flash(`${courtNom(a)} : code effacé`);
  };

  /* ═══════════ RENDEMENTS ═══════════ */
  const bilanZone = (z) => {
    const c = cultures[z], cm = { kg: 0, ecart: 0, coutIntrant: 0, coutMO: 0, heures: 0, oeufs: 0,
      oeufsPerdus: 0, morts: 0, aliment: 0, sujets: 0, ...(cumul[z] || {}) };
    const eff = c ? num(c.effectif) : 0;
    const cible = c && CULTURES[c.type] ? CULTURES[c.type].cible : 0;
    const rdt = eff ? cm.kg / eff : 0;
    const total = cm.coutIntrant + cm.coutMO;
    const avi = !!(c && CULTURES[c.type] && CULTURES[c.type].milieu === "AVI");
    const misEnPlace = eff + cm.morts + cm.sujets;
    return { ...cm, eff, cible, rdt, total, avi, misEnPlace,
      coutKg: cm.kg ? total / cm.kg : 0,
      pctCible: cible ? Math.round((rdt / cible) * 100) : 0,
      perte: cm.kg + cm.ecart ? Math.round((cm.ecart / (cm.kg + cm.ecart)) * 100) : 0,
      tauxMortalite: misEnPlace ? Math.round((cm.morts / misEnPlace) * 1000) / 10 : 0,
      indiceConso: cm.kg ? Math.round((cm.aliment / cm.kg) * 100) / 100 : 0,
      coutOeuf: cm.oeufs ? total / cm.oeufs : 0,
      casseOeufs: cm.oeufs + cm.oeufsPerdus ? Math.round((cm.oeufsPerdus / (cm.oeufs + cm.oeufsPerdus)) * 100) : 0 };
  };
  const regimesAcouper = regimes.filter((r) => r.coupes < r.nb && jours(date, r.prevision) <= 7);
  const regimesRetard = regimes.filter((r) => r.coupes < r.nb && jours(r.prevision, date) > 7);
  const regimesSurPied = regimes.reduce((s, r) => s + (r.nb - r.coupes), 0);

  /* ═══════════ EXPORT CSV ═══════════ */
  const telecharger = (nom, texte) => {
    try {
      const b = new Blob(["\uFEFF" + texte], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = nom; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(u); }, 3000);
      return true;
    } catch { return false; }
  };
  const construireCsv = (quoi) => {
    let l = [];
    if (quoi === "journee") {
      l.push(csvLigne(["Date", "Section", "Type", "Zone", "Détail", "Quantité", "Unité", "Coût USD", "Agent"]));
      travaux.forEach((t) => l.push(csvLigne([date, NOM_BUREAU, "Travail", t.zone, t.tache, t.qte, t.unite, t.coutMO || "", courtNom(t.qui)])));
      engrais.forEach((e) => e.produits.forEach((p) => l.push(csvLigne([date, NOM_BUREAU, "Fertilisation", e.zone, `${e.bac} — ${p.nom} ${p.dose}`, p.qte, "", "", courtNom(e.qui)]))));
      engrais.filter((e) => e.produitsManquants).forEach((e) => l.push(csvLigne([date, NOM_BUREAU, "Manquement fertilisation", e.zone, `${e.bac} — ${e.produitsManquants}`, "", "", "", courtNom(e.qui)])));
      phyto.forEach((p) => p.produits.forEach((x) => l.push(csvLigne([date, NOM_BUREAU, "Traitement", p.zone, `${x.nom} ${x.dose}`, x.qte, "", "", courtNom(p.qui)]))));
      mesures.forEach((m) => l.push(csvLigne([date, NOM_BUREAU, "Mesure", m.zone, m.nom, m.valeur, m.unite, "", m.par])));
      recoltes.forEach((r) => l.push(csvLigne([date, NOM_BUREAU, "Récolte", r.zone, r.lot, r.kg, "kg", "", ""])));
      livraisons.forEach((v) => l.push(csvLigne([date, NOM_BUREAU, "Livraison", v.client, `BL ${v.bl}`, v.kg, "kg", usd(num(v.kg) * num(v.pu)), v.receptionnaire])));
      alimentation.forEach((a) => l.push(csvLigne([date, NOM_BUREAU, "Aliment", a.zone, nomArt(a.articleId), a.kg, "kg", usd(a.cout), a.par])));
      ponte.forEach((x) => l.push(csvLigne([date, NOM_BUREAU, "Ponte", x.zone, `${x.sales} sales / ${x.casses} cassés`, x.oeufs, "œufs", "", x.par])));
      cheptel.forEach((x) => l.push(csvLigne([date, NOM_BUREAU, "Cheptel", x.zone, `morts ${x.morts || 0}, éclosions ${x.naissances || 0}, sorties ${x.sorties || 0}`, x.kg, "kg vif", "", x.par])));
      sante.forEach((x) => l.push(csvLigne([date, NOM_BUREAU, "Santé", x.zone, `${x.type} — ${nomArt(x.articleId)}`, x.sujets, "sujets", usd(x.cout), x.par])));
      problemes.forEach((p) => l.push(csvLigne([date, NOM_BUREAU, "Problème", p.ou, p.quoi, "", "", "", ""])));
    } else if (quoi === "stock") {
      l.push(csvLigne(["Code", "Article", "Catégorie", "Stock", "Unité", "Seuil", "Prix unitaire", "Valeur", "Péremption"]));
      articles.forEach((a) => l.push(csvLigne([a.id, a.nom, a.cat, a.stock, a.unite, a.seuil, a.prix, usd(a.stock * a.prix), a.peremption])));
    } else if (quoi === "mouvements") {
      l.push(csvLigne(["Horodatage", "Type", "Article", "Quantité", "Unité", "Motif", "Zone", "Agent"]));
      mouvements.forEach((m) => l.push(csvLigne([m.t, m.type, m.nom, m.qte, m.unite, m.motif, m.zone, m.agent])));
    } else if (quoi === "lots") {
      l.push(csvLigne(["Lot", "Date", "Zone", "Culture", "JAT", "Kg", "Écartés", "Qualité", "Restant", "Traitements 60 j", "Livraisons"]));
      lots.forEach((x) => l.push(csvLigne([x.id, x.date, x.zone, x.culture, x.jat, x.kg, x.ecart, x.qualite, x.restant,
        x.traitements.map((t) => `${t.date} ${t.produits.join(" + ")}`).join(" | "),
        x.sorties.map((s) => `BL ${s.bl} ${s.client} ${s.kg}kg`).join(" | ")])));
    } else if (quoi === "regimes") {
      l.push(csvLigne(["Parc", "Date de gainage", "Ruban", "Régimes", "Coupés", "Sur pied", "Coupe prévue", "Poids unitaire", "Volume prévu kg"]));
      regimes.forEach((r) => l.push(csvLigne([r.parc, r.date, r.ruban, r.nb, r.coupes, r.nb - r.coupes, r.prevision, r.poids, (r.nb - r.coupes) * r.poids])));
    } else if (quoi === "mesures") {
      l.push(csvLigne(["Date", "Section", "Mesure", "Valeur", "Unité", "Zone", "Agent"]));
      mesuresH.forEach((m) => l.push(csvLigne([m.date, m.bureau, m.nom, m.valeur, m.unite, m.zone, m.par])));
    } else if (quoi === "rendements") {
      l.push(csvLigne(["Zone", "Culture", "Départ", "Jours", "Effectif", "Kg retenus", "Kg écartés", "Pertes %",
        "Rendement", "Cible", "% cible", "Coût intrants", "Coût main-d'œuvre", "Coût total", "Coût par kg",
        "Œufs", "Mortalité", "Taux mortalité %", "Aliment kg", "Indice de consommation"]));
      Object.keys(cultures).forEach((z) => {
        const c = cultures[z], b = bilanZone(z);
        l.push(csvLigne([z, c.type, c.debut, jours(c.debut, date), b.eff, b.kg, b.ecart, b.perte,
          Math.round(b.rdt * 100) / 100, b.cible, b.pctCible, usd(b.coutIntrant), usd(b.coutMO), usd(b.total), usd(b.coutKg),
          b.oeufs, b.morts, b.tauxMortalite, b.aliment, b.indiceConso]));
      });
    } else if (quoi === "demandes") {
      l.push(csvLigne(["Réf", "Date", "Type", "Objet", "Article", "Quantité", "Montant", "Centre",
        "Urgence", "Demandeur", "Validateur", "Statut", "Motif"]));
      demandes.forEach((d) => l.push(csvLigne([d.id, d.date, d.type, d.objet, d.articleId ? nomArt(d.articleId) : "",
        d.qte, usd(montantDemande(d)), `${d.centre} ${nomCentre(d.centre)}`, d.urgence, d.demandeur,
        courtNom(d.validateur), d.statut, d.motif])));
    } else if (quoi === "centres") {
      l.push(csvLigne(["Centre", "Libellé", "Coût intrants", "Coût main-d'œuvre", "Demandes engagées", "Total"]));
      CENTRES.forEach((cc) => {
        const zs = Object.keys(cultures).filter((z) => centreAuto(z) === cc.code);
        const ci = zs.reduce((t, z) => t + ((cumul[z] || {}).coutIntrant || 0), 0);
        const cm = zs.reduce((t, z) => t + ((cumul[z] || {}).coutMO || 0), 0);
        const ca = demandes.filter((d) => d.centre === cc.code && ["Validée", "Servie", "Clôturée"].indexOf(d.statut) >= 0)
          .reduce((t, d) => t + montantDemande(d), 0);
        l.push(csvLigne([cc.code, cc.nom, usd(ci), usd(cm), usd(ca), usd(ci + cm + ca)]));
      });
    } else if (quoi === "journal") {
      l.push(csvLigne(["Horodatage", "Agent", "Section", "Action", "Détail"]));
      journal.forEach((e) => l.push(csvLigne([e.t, e.agent, e.bureau, e.action, e.detail])));
    }
    return l.join("\n");
  };
  /* Export multi-journées : relit chaque journée enregistrée dans l'intervalle. */
  const exporterPeriode = async () => {
    if (!perDebut || !perFin) { flash("Indiquez la date de début et la date de fin", 4000); return; }
    if (perDebut > perFin) { flash("La date de début est postérieure à la date de fin", 4000); return; }
    flash("Lecture des journées en cours…", 8000);
    const sections = perTout ? ["TOM", "BAN", "AVI", "LIV"] : [bureau];
    const l = [csvLigne(["Date", "Section", "Type", "Zone", "Centre", "Détail", "Quantité", "Unité",
      "Coût USD", "Agent"])];
    let nb = 0;
    for (const b of sections) {
      let ks = [];
      try { const r = await storage.list(`dt:${b}:`, true); ks = (r && r.keys) ? r.keys : []; }
      catch { ks = []; }
      for (const k of ks.sort()) {
        const d = k.split(":")[2];
        if (!d || d < perDebut || d > perFin) continue;
        const j = await lire(k, null); if (!j) continue;
        nb++;
        const NB = b === "TOM" ? "SERRE" : b === "BAN" ? "BANANERAIE" : b === "AVI" ? "POULAILLER" : "LIVRAISONS";
        (j.presence || []).filter((x) => x.statut === "Présent").forEach((x) => l.push(csvLigne(
          [d, NB, "Présence", "", "CC-GEN", courtNom(x.agent), x.heures, "h",
            usd((num(x.heures) / 8) * tauxDe(x.agent)), courtNom(x.agent)])));
        (j.tachesFaites || []).forEach((t) => l.push(csvLigne(
          [d, NB, "Tâche du calendrier", t.zone, centreAuto(t.zone), t.nom, "", "", "", t.qui])));
        (j.travaux || []).forEach((t) => l.push(csvLigne(
          [d, NB, "Travail", t.zone, t.centre || centreAuto(t.zone), t.tache, t.qte, t.unite,
            usd(t.coutMO || 0), t.par || courtNom(t.qui)])));
        (j.engrais || []).forEach((e) => (e.produits || []).forEach((x) => l.push(csvLigne(
          [d, NB, "Fertilisation", e.zone, e.centre || centreAuto(e.zone),
            `${e.bac} — ${x.nom} ${x.dose}`, x.qte, "", usd(e.cout || 0), e.par]))));
        (j.engrais || []).filter((e) => e.produitsManquants).forEach((e) => l.push(csvLigne(
          [d, NB, "Manquement fertilisation", e.zone, e.centre || centreAuto(e.zone),
            `${e.bac} — ${e.produitsManquants}`, "", "", "", e.par])));
        (j.phyto || []).forEach((x) => (x.produits || []).forEach((y) => l.push(csvLigne(
          [d, NB, "Traitement", x.zone, x.centre || centreAuto(x.zone), `${y.nom} ${y.dose}`,
            y.qte, "", usd(x.cout || 0), x.par]))));
        (j.mesures || []).forEach((m) => l.push(csvLigne(
          [d, NB, "Mesure", m.zone, centreAuto(m.zone), m.nom, m.valeur, m.unite, "", m.par])));
        (j.recoltes || []).forEach((r) => l.push(csvLigne(
          [d, NB, "Récolte", r.zone, centreAuto(r.zone), r.lot || "", r.kg, "kg", "", ""])));
        (j.gainage || []).forEach((g) => l.push(csvLigne(
          [d, NB, "Gainage", g.zone, centreAuto(g.zone), `sac ${g.couleur} — ruban ${g.ruban}`,
            g.nb, "régimes", "", ""])));
        (j.alimentation || []).forEach((a) => l.push(csvLigne(
          [d, NB, "Aliment", a.zone, a.centre || centreAuto(a.zone), nomArt(a.articleId), a.kg, "kg",
            usd(a.cout || 0), a.par])));
        (j.ponte || []).forEach((x) => l.push(csvLigne(
          [d, NB, "Ponte", x.zone, centreAuto(x.zone), `${x.sales} sales / ${x.casses} cassés`,
            x.oeufs, "œufs", "", x.par])));
        (j.cheptel || []).forEach((x) => l.push(csvLigne(
          [d, NB, "Cheptel", x.zone, centreAuto(x.zone),
            `morts ${x.morts || 0} / éclosions ${x.naissances || 0} / sorties ${x.sorties || 0}`,
            x.kg, "kg vif", "", x.par])));
        (j.sante || []).forEach((x) => l.push(csvLigne(
          [d, NB, "Santé animale", x.zone, x.centre || centreAuto(x.zone),
            `${x.type} — ${nomArt(x.articleId)}`, x.sujets, "sujets", usd(x.cout || 0), x.par])));
        (j.livraisons || []).forEach((v) => l.push(csvLigne(
          [d, NB, "Livraison", v.client, "CC-MAG", `BL ${v.bl} — ${v.produit}${v.lot ? " — lot " + v.lot : ""}`,
            v.kg, "kg", usd(num(v.kg) * num(v.pu)), v.receptionnaire])));
        (j.problemes || []).forEach((x) => l.push(csvLigne(
          [d, NB, "Problème", x.ou, centreAuto(x.ou), x.quoi, "", "", "", x.gravite || ""])));
      }
    }
    const t = l.join("\n");
    setCsv(t);
    const nom = `DTomate_v${APP_VERSION}_Periode_${perDebut}_au_${perFin}.csv`;
    const ok = telecharger(nom, t);
    noter("Export période", `${perDebut} → ${perFin} — ${nb} journée(s)`);
    flash(nb ? `${nb} journée(s), ${l.length - 1} ligne(s)${ok ? " — fichier téléchargé" : " — copiez le texte ci-dessous"}`
      : "Aucune journée enregistrée dans cet intervalle", 7000);
  };

  const exporter = (quoi, nom) => {
    const t = construireCsv(quoi); setCsv(t);
    const ok = telecharger(`DTomate_v${APP_VERSION}_${nom}_${date}.csv`, t);
    noter("Export CSV", nom);
    flash(ok ? `${t.split("\n").length - 1} ligne(s) — fichier téléchargé`
      : "Téléchargement bloqué par le navigateur — copiez le texte affiché en bas", 6000);
  };
  /* ═══ SAUVEGARDE ET RESTAURATION INTÉGRALES ═══ */
  const listerCles = async () => {
    try { const r = await storage.list("dt:", true); return (r && r.keys) ? r.keys : []; }
    catch { return []; }
  };
  const inventorier = async () => {
    const ks = await listerCles();
    const g = { journees: 0, archives: 0, photos: 0, registres: 0 };
    ks.forEach((k) => {
      if (k.indexOf("dt:photo:") === 0) g.photos++;
      else if (k.indexOf(":arch:") > 0) g.archives++;
      else if (/^dt:(TOM|BAN|AVI|LIV):/.test(k)) g.journees++;
      else g.registres++;
    });
    setInventaireCles({ ...g, total: ks.length });
    flash(`${ks.length} clé(s) trouvée(s) dans ce carnet`);
  };
  const sauvegardeIntegrale = async () => {
    flash("Lecture de toutes les données…", 10000);
    const ks = await listerCles();
    const base = {};
    let n = 0, photos = 0;
    for (const k of ks) {
      if (!avecPhotos && k.indexOf("dt:photo:") === 0) { photos++; continue; }
      try {
        const r = await storage.get(k, true);
        if (r && r.value) { base[k] = r.value; n++; }
      } catch { /* clé illisible, ignorée */ }
    }
    const paquet = { format: "CARNET-DTOMATE", schema: SCHEMA, version: APP_VERSION,
      site: SITE, entite: ENTITE, exporteLe: `${auj()} ${heure()}`, exportePar: courtNom(agent),
      photosIncluses: avecPhotos, cles: n, donnees: base };
    const t = JSON.stringify(paquet);
    setCsv(t);
    let ok = false;
    try {
      const b = new Blob([t], { type: "application/json" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = `DTomate_SAUVEGARDE_v${APP_VERSION}_${auj()}.json`; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(u); }, 3000);
      ok = true;
    } catch { ok = false; }
    noter("Sauvegarde intégrale", `${n} clé(s)`);
    flash(`${n} clé(s) sauvegardées${photos ? `, ${photos} photo(s) exclue(s)` : ""}${ok ? " — fichier téléchargé" : " — copiez le texte ci-dessous"}`, 8000);
  };
  const fusionner = (ancien, nouveau) => {
    if (Array.isArray(ancien) && Array.isArray(nouveau)) {
      const vus = new Set(nouveau.map((x) => JSON.stringify(x)));
      const ajouts = ancien.filter((x) => !vus.has(JSON.stringify(x)));
      const tout = [...nouveau, ...ajouts];
      return tout.sort((a, b) => String((b && (b.t || b.date)) || "").localeCompare(String((a && (a.t || a.date)) || "")));
    }
    if (ancien && nouveau && typeof ancien === "object" && typeof nouveau === "object")
      return { ...ancien, ...nouveau };
    return nouveau !== undefined && nouveau !== null && nouveau !== "" ? nouveau : ancien;
  };
  const restaurer = async () => {
    if (!estDirection(agent)) { flash("Seule la Direction peut restaurer une sauvegarde.", 5000); return; }
    if (!modeRestauration) { flash("Choisissez le mode de restauration", 4000); return; }
    let paquet;
    try { paquet = JSON.parse(jsonColle); } catch { flash("Le texte collé n'est pas une sauvegarde valide", 5000); return; }
    if (!paquet || paquet.format !== "CARNET-DTOMATE" || !paquet.donnees) {
      flash("Ce fichier n'est pas une sauvegarde du Carnet de ferme D'Tomate", 6000); return; }
    const cles = Object.keys(paquet.donnees);
    if (!cles.length) { flash("La sauvegarde ne contient aucune donnée", 4000); return; }
    flash(`Restauration de ${cles.length} clé(s)…`, 12000);
    let ecrites = 0, fusionnees = 0, ignorees = 0;
    for (const k of cles) {
      let valeurAncienne;
      try { valeurAncienne = JSON.parse(paquet.donnees[k]); } catch { valeurAncienne = paquet.donnees[k]; }
      const existante = await lire(k, undefined);
      if (existante === undefined) { await ecrire(k, valeurAncienne); ecrites++; }
      else if (modeRestauration === "Fusionner — rien n'est écrasé") {
        await ecrire(k, fusionner(valeurAncienne, existante)); fusionnees++;
      } else if (modeRestauration === "Remplacer — la sauvegarde fait foi") {
        await ecrire(k, valeurAncienne); ecrites++;
      } else ignorees++;
    }
    await ecrire("dt:meta", { schema: SCHEMA, premiere: (paquet.donnees["dt:meta"] ? JSON.parse(paquet.donnees["dt:meta"]).premiere : auj()),
      derniere: auj(), versions: [{ version: APP_VERSION, depuis: auj() }],
      restaureLe: `${auj()} ${heure()}`, restaureDepuis: paquet.version || "?" });
    noter("Restauration", `${ecrites} écrite(s), ${fusionnees} fusionnée(s), depuis la v${paquet.version || "?"}`);
    setJsonColle("");
    flash(`Restauration terminée : ${ecrites} clé(s) écrite(s), ${fusionnees} fusionnée(s). Fermez et rouvrez l'application.`, 12000);
  };

  const exporterTout = () => {
    const jeux = [["journee", "Journée en cours"], ["rendements", "Rendements et coûts"],
      ["centres", "Coûts par centre"], ["stock", "Inventaire"], ["mouvements", "Mouvements de stock"],
      ["demandes", "Demandes"], ["lots", "Lots"], ["regimes", "Régimes"], ["mesures", "Mesures"],
      ["journal", "Journal"]];
    const t = jeux.map(([k, n]) => `### ${n.toUpperCase()} ###\n${construireCsv(k)}`).join("\n\n");
    setCsv(t);
    const ok = telecharger(`DTomate_v${APP_VERSION}_Sauvegarde_complete_${date}.csv`, t);
    noter("Export complet", date);
    flash(ok ? "Sauvegarde complète téléchargée" : "Téléchargement bloqué — copiez le texte affiché", 6000);
  };

  /* ═══════════ RAPPORT ═══════════ */
  const rapport = () => {
    const suivies = (tachesServeur || []).filter((t) => zonesBureau.includes(t.zone));
    const validees = suivies.filter((t) => t.status === "done").length;
    const aValider = suivies.filter((t) => t.status === "pending_review").length;
    const presents = presence.filter((p) => p.statut === "Présent").length;
    return [
      `RAPPORT SYNTHÉTIQUE — ${NOM_BUREAU} — ${date}`,
      tachesServeur === null ? "Activités : suivi serveur indisponible" : `Activités dues : ${suivies.length} · exécutées / validées : ${validees} · à valider : ${aValider} · non exécutées : ${suivies.length - validees - aValider}`,
      `Travaux saisis dans le carnet : ${travaux.length}`,
      ...travaux.map((t) => `${t.zone} — ${t.tache} — ${t.qte} ${t.unite} · ${t.personnes} pers. × ${t.heures} h${t.par || t.qui ? ` — ${t.par || courtNom(t.qui)}` : ""} — ${usd(t.coutMO || 0)} ${DEVISE}`),
      ...engrais.filter((e) => e.produitsManquants).map((e) => `MANQUEMENT FERTILISATION — ${e.zone} — ${e.bac} : ${e.produitsManquants}`),
      `Pointages saisis : ${presents} présent(s) · ${presence.length - presents} non présent(s)`,
      `Stocks en alerte : ${alertesStock} (état actuel)`,
      `Problèmes signalés : ${problemes.length}`,
      `Détails par catégorie et preuves : ${window.location.origin}/taches?date=${date}`,
    ].join("\n");
  };
  const rapportDetaille = () => {
    const L = [];
    L.push(`RAPPORT JOURNALIER — ${NOM_BUREAU}`);
    L.push(ENTITE); L.push(SITE);
    L.push(`Date : ${date}  (semaine ${semaineIso(date)})`);
    L.push(`Carnet de ferme version ${APP_VERSION}`);
    if (meteo) L.push(`Météo : ${meteo}`);
    L.push(`Saisi par : ${courtNom(agent)}`);
    L.push("");
    if (presence.length) {
      const pr = presence.filter((p) => p.statut === "Présent");
      L.push(`PRÉSENCE — ${pr.length} présent(s) — main-d'œuvre ${usd(coutMOjour)} ${DEVISE}`);
      presence.forEach((p) => L.push(`  ${courtNom(p.agent)} — ${p.statut}${p.statut === "Présent" ? ` — ${p.heures} h` : ""}`));
      L.push("");
    }
    if (bureau !== "LIV" && zonesBureau.some((z) => cultures[z])) {
      L.push("CULTURES EN PLACE");
      zonesBureau.filter((z) => cultures[z]).forEach((z) => {
        const c = cultures[z], j = jours(c.debut, date), b = bilanZone(z);
        L.push(`  ${z} : ${c.type} — J+${j} — ${phaseDe(c.type, j)}${c.effectif ? ` — ${c.effectif} plants` : ""}${c.aConfirmer ? " — DATE À CONFIRMER" : ""}`);
        if (b.kg) L.push(`      cumul ${b.kg} kg · ${Math.round(b.rdt * 100) / 100} ${CULTURES[c.type].uniteCible} (${b.pctCible} % de la cible) · ${usd(b.coutKg)} ${DEVISE}/kg`);
      });
      L.push("");
      L.push("SUIVI DES TÂCHES ATTRIBUÉES — PREUVES ET JUSTIFICATIONS");
      if (tachesServeur === null) L.push("  Suivi indisponible : consulter l'espace Tâches quotidiennes.");
      else {
        const suivies = tachesServeur.filter((t) => zonesBureau.includes(t.zone));
        suivies.length ? suivies.forEach((t, i) => L.push(`  ${i + 1}. ${t.zone} — ${t.nom} — ${t.qui} — ${t.status === "done" ? `EXÉCUTION VALIDÉE (${t.photos} photo(s)) à ${t.h}` : t.status === "justified" ? `NON EXÉCUTÉE / JUSTIFIÉE : ${t.justification}` : t.status === "pending_review" ? "PREUVE À VALIDER" : t.status === "correction_requested" ? "CORRECTION ATTENDUE" : "NON EXÉCUTÉE / SANS RÉPONSE"} — journée ${t.work_date}`)) : L.push("  Aucune tâche générée visible. Faire vérifier la génération et les attributions par le responsable.");
        L.push(`  Preuves et rapport complet : ${window.location.origin}/taches?date=${date}`);
      }
      L.push("");
    }
    const bloc = (titre, liste, fmt) => {
      L.push(titre);
      liste.length ? liste.forEach((x, i) => L.push(`  ${i + 1}. ${fmt(x)}`)) : L.push("  (néant)");
      L.push("");
    };
    if (bureau === "AVI") {
      L.push(`ALIMENTATION — ${totalAliment} kg distribués`);
      alimentation.length ? alimentation.forEach((a, i) => L.push(
        `  ${i + 1}. ${a.zone} — ${nomArt(a.articleId)} — ${a.kg} kg${a.eau ? ` — eau : ${a.eau}` : ""} — ${a.par}`))
        : L.push("  (néant)");
      L.push("");
      L.push(`PONTE — ${totalOeufs} œufs propres, ${totalSales} sales, ${totalCasses} cassés${tauxPonte !== null ? ` — taux de ponte ${tauxPonte} %` : ""}`);
      ponte.length ? ponte.forEach((x, i) => L.push(
        `  ${i + 1}. ${x.zone} — ${x.oeufs} propres / ${x.sales} sales / ${x.casses} cassés — ${x.ramassages} ramassage(s) — ${x.par}`))
        : L.push("  (néant)");
      L.push("");
      L.push(`CHEPTEL — ${totalMorts} mortalité(s) du jour`);
      cheptel.length ? cheptel.forEach((x, i) => L.push(
        `  ${i + 1}. ${x.zone} — ${x.morts || 0} mort(s)${x.cause ? ` (${x.cause})` : ""} — ${x.naissances || 0} éclosion(s) — ${x.sorties || 0} sortie(s)${x.kg ? ` / ${x.kg} kg vif` : ""}${x.poidsMoyen ? ` — poids moyen ${x.poidsMoyen} g` : ""}`))
        : L.push("  (néant)");
      L.push("");
      L.push("SANTÉ ANIMALE");
      sante.length ? sante.forEach((x, i) => L.push(
        `  ${i + 1}. ${x.zone} — ${x.type} — ${nomArt(x.articleId)} [${x.etiquette}] — ${x.sujets} sujets${x.delai ? ` — VENTE INTERDITE JUSQU'AU ${x.delai}` : ""} — ${x.par}`))
        : L.push("  (néant)");
      L.push("");
      bloc("TRAVAUX", travaux, (t) => `${t.zone} — ${t.tache} — ${t.qte} ${t.unite} — ${t.personnes} pers. × ${t.heures} h${t.par ? " — " + t.par : ""}`);
      if (mesures.length) bloc("MESURES", mesures, (m) =>
        `${m.nom} : ${m.valeur} ${m.unite}${m.zone ? ` — ${m.zone}` : ""}${mesureHorsNorme(m) ? "  ← HORS NORME" : ""}`);
    } else if (bureau === "LIV") {
      L.push(`LIVRAISONS — ${totalLivKg} kg — ${usd(totalLivUsd)} ${DEVISE}`);
      livraisons.length ? livraisons.forEach((l, i) => {
        const pc = num(l.caisses) ? Math.round((num(l.kg) / num(l.caisses)) * 10) / 10 : 0;
        L.push(`  ${i + 1}. BL n° ${l.bl} — ${l.client} — ${l.produit}${l.lot ? ` — lot ${l.lot}` : ""}`);
        L.push(`      ${l.caisses || "?"} caisses / ${l.kg} kg${pc ? ` (${pc} kg par caisse${pc > POIDS_CAISSE_MAX ? " — SURCHARGE" : ""})` : ""}`);
        L.push(`      PU ${usd(l.pu)} ${DEVISE}/kg — Montant ${usd(num(l.kg) * num(l.pu))} ${DEVISE}`);
        L.push(`      Reçu par ${l.receptionnaire} — ${l.signe}${l.h ? " — " + l.h : ""}`);
      }) : L.push("  (néant)");
      L.push("");
      bloc("TRAVAUX DE MAGASIN", travaux, (t) => `${t.zone} — ${t.tache} — ${t.qte} ${t.unite}${t.qui ? " — " + courtNom(t.qui) : ""}`);
    } else {
      bloc("TRAVAUX EXÉCUTÉS", travaux, (t) =>
        `${t.zone} — ${t.tache} — ${t.qte} ${t.unite} — ${t.personnes} pers. × ${t.heures} h${t.qui ? " — " + courtNom(t.qui) : ""}`);
      bloc("FERTILISATION", engrais, (e) =>
        `${e.zone} — ${e.bac}${e.volume ? ` (${e.volume} L)` : ""} — ${e.produits.map((p) => `${p.nom} ${p.dose}${p.qte ? ` [${p.qte} sorti du stock]` : ""}`).join(" + ")} — ${usd(e.cout)} ${DEVISE}${e.produitsManquants ? ` — MANQUEMENT : ${e.produitsManquants}` : ""}`);
      bloc("TRAITEMENTS PHYTOSANITAIRES", phyto, (p) =>
        `${p.zone}${p.volume ? ` (${p.volume} L)` : ""} — ${p.produits.map((x) => `${x.nom} ${x.dose}`).join(" + ")}${p.cible ? ` — cible : ${p.cible}` : ""}${p.dar ? ` — RÉCOLTE INTERDITE JUSQU'AU ${p.dar}` : ""}`);
      if (mesures.length) bloc("MESURES", mesures, (m) =>
        `${m.nom} : ${m.valeur} ${m.unite}${m.zone ? ` — ${m.zone}` : ""}${mesureHorsNorme(m) ? "  ← HORS NORME" : ""}`);
      if (bureau === "BAN") {
        bloc(`GAINAGE${sacsInterdits ? ` — ${sacsInterdits} SAC(S) NON CONFORME(S)` : ""}`, gainage,
          (g) => `${g.zone} — ${g.nb} régime(s) — sac ${g.couleur} — ruban ${g.ruban}${g.bourgeon ? ` — bourgeon : ${g.bourgeon}` : ""}`);
        if (regimesAcouper.length) {
          L.push("RÉGIMES À COUPER SOUS 7 JOURS");
          regimesAcouper.forEach((r, i) => L.push(`  ${i + 1}. ${r.parc} — ruban ${r.ruban} — ${r.nb - r.coupes} régime(s) — prévu le ${r.prevision} — environ ${(r.nb - r.coupes) * r.poids} kg`));
          L.push("");
        }
      }
      L.push(`RÉCOLTE — ${totalKg} kg retenus / ${totalEcart} kg écartés (${tauxPerte} % de pertes)`);
      recoltes.length ? recoltes.forEach((r, i) => L.push(
        `  ${i + 1}. ${r.zone} — ${r.kg} kg — lot ${r.lot}${r.regimes ? ` — ${r.regimes} régimes` : ""}${r.caisses ? ` — ${r.caisses} caisses` : ""}${r.qualite ? ` — ${r.qualite}` : ""}${r.ecart ? ` — écartés ${r.ecart} kg (${r.motif})` : ""}`))
        : L.push("  (néant)");
      L.push("");
    }
    L.push("PROBLÈMES ET OBSERVATIONS");
    problemes.length ? problemes.forEach((p, i) => L.push(`  ${i + 1}. ${p.ou} — ${p.quoi}${p.gravite ? ` — ${p.gravite}` : ""}${(p.photos || []).length ? ` — ${p.photos.length} photo(s)` : ""}`))
      : L.push("  (rien à signaler)");

    const al = [];
    if (sacsInterdits) al.push(`${sacsInterdits} régime(s) sous sac noir ou gris — à remplacer par du bleu perforé.`);
    if (caissesLourdes.length) al.push(`${caissesLourdes.length} livraison(s) au-dessus de ${POIDS_CAISSE_MAX} kg par caisse.`);
    if (livraisons.some((l) => l.signe.startsWith("Non"))) al.push("Bon(s) de livraison sans signature du réceptionnaire.");
    if (totalMorts > 0 && effectifAvi > 0 && (totalMorts / effectifAvi) > 0.01)
      al.push(`Mortalité de ${Math.round((totalMorts / effectifAvi) * 1000) / 10} % en une journée — au-dessus du seuil de 1 %.`);
    if (totalCasses > 0 && totalOeufs > 0 && (totalCasses / (totalOeufs + totalCasses)) > 0.03)
      al.push(`${totalCasses} œufs cassés sur ${totalOeufs + totalCasses + totalSales} — vérifier le calcium, la fréquence de ramassage et les pondoirs.`);
    alimentation.filter((a) => a.transition === "Oui — transition progressive sur 3 jours")
      .forEach((a) => al.push(`${a.zone} — aliment en transition : ${nomArt(a.articleId)}. Vérifier la fin de transition sous 3 jours.`));
    mesures.filter(mesureHorsNorme).forEach((m) => al.push(`${m.nom} hors norme : ${m.valeur} ${m.unite}.`));
    rupture.forEach((a) => al.push(`Rupture de stock : ${a.nom}.`));
    sousSeuil.forEach((a) => al.push(`Stock bas : ${a.nom} — ${a.stock} ${a.unite} pour un seuil de ${a.seuil}.`));
    perimeBientot.forEach((a) => al.push(`${a.nom} périme le ${a.peremption}.`));
    regimesRetard.forEach((r) => al.push(`${r.parc} — ruban ${r.ruban} : ${r.nb - r.coupes} régime(s) dépassent la date de coupe du ${r.prevision}.`));
    zonesBureau.filter((z) => cultures[z]).forEach((z) =>
      tachesDues(z, cultures[z], date, regTaches, CULTURES).filter((t) => t.retard > 0)
        .forEach((t) => al.push(`${z} — ${t.nom} : ${t.retard} jour(s) de retard.`)));
    anomalies.filter((a) => a.gravite !== "donnee").forEach((a) => al.push(`${a.zone} — ${a.texte}`));
    demandesAvalider.forEach((d) => al.push(`Demande ${d.id} (${d.type}, ${usd(montantDemande(d))} ${DEVISE}) en attente chez ${courtNom(d.validateur)}.`));
    if (al.length) { L.push(""); L.push("POINTS À TRANCHER PAR LA DIRECTION"); al.forEach((a, i) => L.push(`  ${i + 1}. ${a}`)); }
    return L.join("\n");
  };
  const ficheLot = (l) => {
    const L = [`FICHE DE TRAÇABILITÉ — ${l.id}`, ENTITE, SITE, "",
      `Parcelle : ${l.zone}`, `Culture : ${l.culture}${l.jat !== null ? ` — J+${l.jat} au jour de la récolte` : ""}`,
      `Date de récolte : ${l.date}`, `Quantité retenue : ${l.kg} kg${l.caisses ? ` — ${l.caisses} caisses` : ""}`,
      `Écartés au tri : ${l.ecart} kg${l.motif ? ` (${l.motif})` : ""}`, `Qualité : ${l.qualite || "non précisée"}`,
      `Récolté sous la responsabilité de : ${l.par}`, "", "TRAITEMENTS DES 60 JOURS PRÉCÉDENTS"];
    l.traitements.length ? l.traitements.forEach((t, i) =>
      L.push(`  ${i + 1}. ${t.date} — ${t.produits.join(" + ")}${t.dar ? ` — récolte autorisée à partir du ${t.dar}` : ""}`))
      : L.push("  (aucun traitement enregistré sur cette période)");
    L.push(""); L.push("DESTINATIONS");
    l.sorties.length ? l.sorties.forEach((s, i) => L.push(`  ${i + 1}. ${s.date} — BL n° ${s.bl} — ${s.client} — ${s.kg} kg`))
      : L.push("  (lot non encore livré)");
    L.push(`  Reste en stock : ${l.restant} kg`);
    return L.join("\n");
  };

  const copier = async (t) => {
    try { await navigator.clipboard.writeText(t); flash("Copié"); }
    catch { flash("Copie impossible — sélectionnez le texte à la main"); }
  };
  const chargerHisto = async () => {
    try {
      const r = await storage.list(`dt:${bureau}:`, true);
      const ks = (r && r.keys) ? [...r.keys].sort().reverse() : [];
      const out = [];
      for (const k of ks.slice(0, 40)) {
        const d = await lire(k, null);
        if (d) out.push({ cle: k, date: k.split(":")[2],
          n: (d.travaux || []).length + (d.engrais || []).length + (d.phyto || []).length
            + (d.recoltes || []).length + (d.gainage || []).length + (d.livraisons || []).length,
          kg: (d.recoltes || []).reduce((s, x) => s + num(x.kg), 0),
          tf: (d.tachesFaites || []).length, pb: (d.problemes || []).length });
      }
      setHisto(out);
    } catch { flash("Historique indisponible"); }
  };
  useEffect(() => { if (sousPage === "histo") chargerHisto(); }, [sousPage, bureau]);

  /* ═══════════ NAVIGATION ═══════════ */
  const ONG = bureau === "TOM"
    ? [["accueil", "Accueil"], ["semaine", "Semaine"], ["travaux", "Travaux"], ["engrais", "Engrais"],
       ["phyto", "Phyto"], ["mesures", "Mesures"], ["recolte", "Récolte"], ["soucis", "Problèmes"],
       ["demandes", "Demandes"], ["rapport", "Rapport"], ["registres", "Registres"]]
    : bureau === "BAN"
    ? [["accueil", "Accueil"], ["semaine", "Semaine"], ["travaux", "Travaux"], ["engrais", "Engrais"],
       ["phyto", "Phyto"], ["mesures", "Mesures"], ["gainage", "Gainage"], ["recolte", "Récolte"],
       ["soucis", "Problèmes"], ["demandes", "Demandes"], ["rapport", "Rapport"], ["registres", "Registres"]]
    : bureau === "AVI"
    ? [["accueil", "Accueil"], ["semaine", "Semaine"], ["aliment", "Aliment"], ["ponte", "Ponte"],
       ["cheptel", "Cheptel"], ["sante", "Santé"], ["travaux", "Travaux"], ["mesures", "Mesures"],
       ["soucis", "Problèmes"], ["demandes", "Demandes"], ["rapport", "Rapport"], ["registres", "Registres"]]
    : [["accueil", "Accueil"], ["livraison", "Livraisons"], ["travaux", "Magasin"], ["soucis", "Problèmes"],
       ["demandes", "Demandes"], ["rapport", "Rapport"], ["registres", "Registres"]];
  const idx = ONG.findIndex(([k]) => k === onglet);
  const cpt = { travaux: travaux.length, engrais: engrais.length, phyto: phyto.length, mesures: mesures.length,
    recolte: recoltes.length, gainage: gainage.length, livraison: livraisons.length, soucis: problemes.length,
    aliment: alimentation.length, ponte: ponte.length, sante: sante.length, cheptel: cheptel.length,
    demandes: aMonAction.length, registres: alertesStock + aMonAction.length };
  const REGISTRES = [
    ["donnees", "Données et sauvegarde", "Conserver le carnet d'une version à l'autre"],
    ["alertes", "Alertes du stock", "Ruptures, seuils, péremptions — recalculées à chaque ouverture"],
    ["controle", "Contrôle du calendrier", "Retards, actions manquées, données manquantes"],
    ["references", "Plans et calendriers", "Le plan d'exploitation et le calendrier de chaque spéculation"],
    ["cultures", "Cultures en place", "Installer, confirmer une date, clôturer un cycle"],
    ["stock", "Stock et intrants", "Entrées, prix, seuils, péremptions"],
    ["couts", "Coûts et rendements", "kg par plant, coût au kilo, écart à la cible"],
    ["lots", "Lots et traçabilité", "Fiche complète de chaque lot récolté"],
    ...(bureau === "BAN" ? [["regimes", "Suivi des régimes", "Rubans, dates de coupe, volumes prévus"]] : []),
    ["mesuresH", "Historique des mesures", "EC, pH, températures, pluie"],
    ["journal", "Journal d'activité", "Qui a fait quoi, et quand"],
    ["histo", "Rapports enregistrés", "Rouvrir une journée passée"],
    ["export", "Export CSV", "Sortir les données du carnet"],
    ...(estDirection(agent) ? [["acces", "Accès et codes", "Code de site, codes personnels"]] : []),
  ];
  const zonesLibres = zonesBureau.filter((z) => !cultures[z]);
  const typesPourBureau = Object.keys(CULTURES).filter((t) => CULTURES[t].milieu === bureau);
  const lotsDispo = lots.filter((l) => l.restant > 0);

  /* ═══════════ ÉCRAN D'ACCÈS — après tous les hooks ═══════════ */
  if (etape !== "ok") {
    return (
      <div className="carnet-app" style={{ minHeight: "100vh", background: C.paper, fontFamily: "Inter, sans-serif", color: C.ink }}>
        <SessionMenu />
      <style>{FONTS}</style>
        <div style={{ background: C.green, padding: "28px 16px 24px" }}>
          <div style={{ fontFamily: OSW, fontSize: 12, letterSpacing: 2.4, color: "rgba(255,255,255,.78)",
            textTransform: "uppercase" }}>{SITE}</div>
          <div style={{ fontFamily: OSW, fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1.1,
            marginTop: 4 }}>CARNET DE FERME</div>
          <div style={{ fontFamily: OSW, fontSize: 15, color: "rgba(255,255,255,.85)", marginTop: 2 }}>
            La Ferme D'Tomate — version {APP_VERSION} du {APP_DATE}</div>
        </div>
        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          {erreurAcces && <Alerte>{erreurAcces}</Alerte>}
          {etape === "site" ? (<>
            <Label>Code du site</Label>
            <TextIn value={saisieSite} onChange={setSaisieSite} placeholder="Code communiqué par la Direction" />
            <Bouton tone="vert" onClick={validerSite}>Continuer</Bouton>
            {codeSite === CODE_SITE_DEFAUT && <Note tone={C.red}>
              Le code de site est encore celui d'usine. La Direction doit le changer dès la première
              connexion : <b>Registres → Accès</b>.
            </Note>}
          </>) : (<>
            <Label>Votre nom</Label>
            <Select value={agent} onChange={(v) => { setAgent(v); setErreurAcces(""); }}
              options={AGENTS} placeholder="Choisir dans la liste" />
            <Label>{agent && !codes[agent] ? "Créez votre code à 4 chiffres" : "Votre code à 4 chiffres"}</Label>
            <TextIn value={saisieCode} onChange={setSaisieCode} type="tel" placeholder="••••" />
            <Bouton tone="vert" onClick={validerAgent}>Entrer</Bouton>
            <Bouton tone="ghost" petit onClick={() => { setEtape("site"); setErreurAcces(""); }}>Retour</Bouton>
            <Note>Ce code <b>signe vos saisies</b> : chaque ligne du carnet portera votre nom.
              Ne le communiquez à personne.</Note>
          </>)}
        </div>
      </div>
    );
  }

  return (
    <div className="carnet-app" style={{ minHeight: "100vh", background: C.paper, fontFamily: "Inter, sans-serif", color: C.ink }}>
      <SessionMenu />
      <style>{FONTS}</style>

      <div style={{ background: ACC, padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontFamily: OSW, fontSize: 11.5, letterSpacing: 2.2, color: "rgba(255,255,255,.78)",
              textTransform: "uppercase" }}>La Ferme D'Tomate — Ntetema</div>
            <div style={{ fontFamily: OSW, fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1.1,
              marginTop: 2 }}>CARNET DE FERME <span style={{ fontSize: 13, fontWeight: 600,
                color: "rgba(255,255,255,.7)" }}>v{APP_VERSION}</span></div>
          </div>
          <button onClick={deconnecter} style={{ background: "rgba(255,255,255,.18)",
            border: "1px solid rgba(255,255,255,.5)", color: "#fff", borderRadius: 4, padding: "8px 10px",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
            whiteSpace: "nowrap" }}>{courtNom(agent)} · sortir</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {[["TOM", "SERRE"], ["BAN", "BANANE"], ["AVI", "POULAILLER"], ["LIV", "LIVRAISON"]].map(([k, lib]) => (
            <button key={k} onClick={() => { setBureau(k); setOnglet("accueil"); setSousPage(""); }}
              style={{ flex: "1 1 40%", padding: "12px 4px", fontSize: 13.5, fontWeight: 700, borderRadius: 4,
                border: bureau === k ? "3px solid #fff" : "2px solid rgba(255,255,255,.45)",
                background: bureau === k ? "#fff" : "transparent", color: bureau === k ? ACC : "#fff",
                fontFamily: OSW, letterSpacing: 0.8, cursor: "pointer" }}>{lib}</button>))}
        </div>
        <div style={{ marginTop: 12, padding: "10px 10px 8px", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.24)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontFamily: OSW, color: "rgba(255,255,255,.82)", fontSize: 12, fontWeight: 600, letterSpacing: 1.1, textTransform: "uppercase" }}>Journée de travail</div>
            <button onClick={() => setDate(auj())} style={{ minHeight: 32, padding: "4px 9px", border: "1px solid rgba(255,255,255,.42)", borderRadius: 7, background: "transparent", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Aujourd’hui</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button aria-label="Jour précédent" onClick={() => setDate(plusJours(date, -1))} style={{ width: 44, padding: 0, border: "none", borderRadius: 8, background: "rgba(255,255,255,.2)", color: "#fff", fontSize: 25, cursor: "pointer" }}>‹</button>
            <input aria-label="Date de travail" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ minWidth: 0, flex: 1, padding: "11px 10px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "#fff", fontFamily: "Inter, sans-serif", color: C.ink }} />
            <button aria-label="Jour suivant" onClick={() => setDate(plusJours(date, 1))} style={{ width: 44, padding: 0, border: "none", borderRadius: 8, background: "rgba(255,255,255,.2)", color: "#fff", fontSize: 25, cursor: "pointer" }}>›</button>
          </div>
          <div style={{ color: "rgba(255,255,255,.82)", fontSize: 13, marginTop: 7, textTransform: "capitalize" }}>{dateLibelle}</div>
        </div>
      </div>

      <div style={{ display: "flex", overflowX: "auto", background: "#fff", borderBottom: `2px solid ${C.line}`,
        position: "sticky", top: 0, zIndex: 5 }}>
        {ONG.map(([k, lib]) => (
          <button key={k} onClick={() => { setOnglet(k); setSousPage(""); }}
            style={{ flex: "1 0 auto", padding: "14px 12px", fontSize: 13.5, fontWeight: 600, fontFamily: OSW,
              letterSpacing: 0.6, textTransform: "uppercase", border: "none", cursor: "pointer",
              whiteSpace: "nowrap", background: onglet === k ? C.laterite : "#fff",
              color: onglet === k ? "#fff" : C.ink,
              borderBottom: onglet === k ? `4px solid ${C.ink}` : "4px solid transparent" }}>
            {lib}{cpt[k] ? ` (${cpt[k]})` : ""}
          </button>))}
      </div>

      <div style={{ padding: 16, maxWidth: 660, margin: "0 auto", paddingBottom: 24 }}>

        {sacsInterdits > 0 && <Alerte>
          {sacsInterdits} régime(s) sous sac noir ou gris. Le plastique foncé chauffe et cuit les doigts.
          Remplacez par du bleu perforé aujourd'hui.</Alerte>}
        {caissesLourdes.length > 0 && <Alerte>
          {caissesLourdes.length} livraison(s) dépassent {POIDS_CAISSE_MAX} kg par caisse.</Alerte>}


        {/* ═════ ACCUEIL ═════ */}
        {onglet === "accueil" && (<>
          <Label>Météo</Label>
          <Select value={meteo} onChange={(v) => { setMeteo(v); sauver({ meteo: v }); }}
            options={["Sec", "Couvert", "Pluie", "Forte pluie", "Vent fort", "Forte chaleur"]} placeholder="Choisir" />

          <Titre couleur={ACC}>PRÉSENCE DU JOUR</Titre>
          {AGENTS.filter((a) => !estDirection(a)).map((a) => {
            const p = presence.find((x) => x.agent === a) || { agent: a, statut: "", heures: 8 };
            const maj = (champ, val) => {
              const n = presence.some((x) => x.agent === a)
                ? presence.map((x) => x.agent === a ? { ...x, [champ]: val } : x)
                : [...presence, { ...p, [champ]: val }];
              setPresence(n); sauver({ presence: n });
            };
            return <Card key={a} tone={p.statut === "Présent" ? C.green2 : p.statut ? C.amber : C.gris}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{courtNom(a)}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {STATUTS_PRESENCE.map((s) => (
                  <button key={s} onClick={() => maj("statut", s)}
                    style={{ padding: "9px 12px", borderRadius: 4, fontSize: 13.5, fontWeight: 600,
                      cursor: "pointer", fontFamily: "Inter, sans-serif",
                      border: p.statut === s ? `2px solid ${C.green}` : `1px solid ${C.line}`,
                      background: p.statut === s ? C.green : "#fff", color: p.statut === s ? "#fff" : C.ink }}>{s}</button>))}
              </div>
              {p.statut === "Présent" && <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <div style={{ fontSize: 14 }}>Heures :</div>
                <input type="number" inputMode="decimal" value={p.heures} onChange={(e) => maj("heures", e.target.value)}
                  style={{ width: 80, padding: 10, fontSize: 17, textAlign: "center", borderRadius: 4,
                    border: `2px solid ${C.line}`, fontFamily: OSW, fontWeight: 700 }} />
                <div style={{ fontSize: 14, color: C.gris }}>≈ {usd((num(p.heures) / 8) * tauxDe(a))} {DEVISE}</div>
              </div>}
            </Card>;
          })}
          <Stat libelle="Main-d'œuvre du jour" valeur={`${usd(coutMOjour)} ${DEVISE}`}
            sous={`${presence.filter((p) => p.statut === "Présent").length} présent(s)`} couleur={C.laterite} />

          {bureau === "LIV" ? (
            <Note tone={C.liv}><b>Le nom du produit ne change jamais :</b> « Tomates de serre — Culture
              Contrôlée ». N'écrivez jamais « hydroponique » : nos tomates poussent en pleine terre.</Note>
          ) : (<>
            <Titre couleur={ACC}>TRAVAIL DU JOUR</Titre>
            <Note>Les tâches ci-dessous proviennent du suivi quotidien du serveur. Attribution, photos, justifications et rappels : <a href={`/taches?date=${date}`} style={{ fontWeight: 700, textDecoration: "underline" }}>ouvrir les tâches quotidiennes</a>.
              {erreurTaches && <div>{erreurTaches}</div>}
              {tachesServeur === null && !erreurTaches && <div>Chargement du suivi…</div>}
            </Note>
            {zonesBureau.map((z) => {
              const c = cultures[z];
              if (!c) return <Card key={z} tone={C.gris}>
                <div style={{ fontFamily: OSW, fontSize: 18, fontWeight: 700 }}>{z}</div>
                <div style={{ fontSize: 15, marginTop: 4, color: C.gris }}>Aucune culture en place — zone libre.</div>
                <Bouton petit tone="ghost" onClick={() => { setCu({ ...vCu, zone: z }); setOnglet("registres"); setSousPage("cultures"); }}>
                  Installer une culture</Bouton>
              </Card>;
              const j = jours(c.debut, date);
              const dues = (tachesServeur || []).filter((t) => t.zone === z).map((t) => ({ ...t,
                faitAuj: t.status === "done", cat: t.status === "justified" ? "Non exécutée / justifiée" : t.status === "done" ? "Exécution validée" : t.status === "pending_review" ? "Preuve à valider" : t.status === "correction_requested" ? "Preuve à corriger" : "Sans réponse",
                rythme: `Responsable : ${t.qui} · journée ${t.work_date}`, dernier: "", retard: t.status === "todo" ? Math.max(0, jours(t.work_date, date)) : 0,
              }));
              const enRetard = dues.filter((t) => t.retard > 0).length;
              return <div key={z} style={{ marginBottom: 18 }}>
                <div style={{ background: enRetard ? C.red : ACC, color: "#fff", padding: "12px 14px",
                  borderRadius: "4px 4px 0 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontFamily: OSW, fontSize: 19, fontWeight: 700 }}>{z}</div>
                    <div style={{ fontFamily: OSW, fontSize: 26, fontWeight: 700 }}>J+{j}</div>
                  </div>
                  <div style={{ fontSize: 14, marginTop: 2 }}>{c.type} · {phaseDe(c.type, j)}
                    {c.effectif ? ` · ${c.effectif} plants` : ""}</div>
                  {enRetard > 0 && <div style={{ fontSize: 14, marginTop: 4, fontWeight: 700 }}>
                    {enRetard} tâche(s) en retard</div>}
                </div>
                {c.aConfirmer && <div style={{ background: C.amber, color: "#fff", padding: "10px 14px",
                  fontSize: 14, lineHeight: 1.45 }}>
                  Date de départ présumée ({c.debut}) — tout le calendrier en dépend. Confirmez-la :
                  <input type="date" defaultValue={c.debut} onChange={(e) => e.target.value && confirmerDate(z, e.target.value)}
                    style={{ width: "100%", marginTop: 8, padding: 10, fontSize: 16, borderRadius: 4, border: "none" }} />
                </div>}
                <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: "none",
                  borderRadius: "0 0 4px 4px", padding: 12 }}>
                  {!dues.length && <div style={{ fontSize: 15, color: C.gris }}>Aucune tâche générée visible. Le responsable doit vérifier les attributions dans l'espace Tâches quotidiennes.</div>}
                  {dues.map((t) => (
                    <div key={t.id} style={{ borderTop: `1px solid ${C.line}`, padding: "12px 0", opacity: t.faitAuj ? 0.55 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <div style={{ fontFamily: OSW, fontSize: 16.5, fontWeight: 600, color: t.retard > 0 ? C.red : C.ink }}>
                          {t.faitAuj ? "✓ " : ""}{t.nom}</div>
                        <div style={{ fontSize: 11.5, fontFamily: OSW, letterSpacing: 0.8, textTransform: "uppercase",
                          color: C.gris, whiteSpace: "nowrap" }}>{t.cat}</div>
                      </div>
                      <div style={{ fontSize: 13, color: C.gris, marginTop: 2 }}>
                        {t.rythme}{t.dernier ? ` · dernier passage le ${t.dernier}` : " · jamais fait"}
                        {t.retard > 0 ? ` · ${t.retard} jour(s) de retard` : ""}</div>
                      <div style={{ fontSize: 14.5, marginTop: 6, lineHeight: 1.5 }}>{t.detail}</div>
                      {t.justification && <div style={{ fontSize: 14, marginTop: 6 }}>Justification : {t.justification}</div>}
                      {["todo", "correction_requested"].includes(t.status) && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={() => marquerTache(z, t, true)}
                          style={{ flex: 2, padding: 12, background: C.green, color: "#fff", border: "none",
                            borderRadius: 4, fontFamily: OSW, fontSize: 15, fontWeight: 700, letterSpacing: 0.6,
                            cursor: "pointer" }}>DÉPOSER UNE PREUVE</button>
                        <button onClick={() => marquerTache(z, t, false)}
                          style={{ flex: 1, padding: 12, background: "#fff", color: C.red, border: `2px solid ${C.red}`,
                            borderRadius: 4, fontFamily: OSW, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>JUSTIFIER</button>
                      </div>}
                    </div>))}
                </div>
              </div>;
            })}
          </>)}
        </>)}

        {/* ═════ SEMAINE ═════ */}
        {onglet === "semaine" && (<>
          <Note>Ce qui vient dans les sept prochains jours, calculé à partir de l'âge de chaque
            culture. Sert à préparer la main-d'œuvre et les commandes d'intrants.</Note>
          {[0, 1, 2, 3, 4, 5, 6].map((k) => {
            const d = plusJours(date, k);
            const lignes = zonesBureau.filter((z) => cultures[z])
              .map((z) => ({ zone: z, taches: tachesDues(z, cultures[z], d, regTaches, CULTURES).filter((t) => t.due) }))
              .filter((x) => x.taches.length);
            const nb = lignes.reduce((s, x) => s + x.taches.length, 0);
            return <div key={d} style={{ marginBottom: 12 }}>
              <div style={{ background: k === 0 ? ACC : "#fff", color: k === 0 ? "#fff" : C.ink,
                border: `1px solid ${C.line}`, borderRadius: "4px 4px 0 0", padding: "10px 14px",
                display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontFamily: OSW, fontSize: 16, fontWeight: 700, textTransform: "capitalize" }}>
                  {JOURS_FR[dow(d)]} {d.slice(8)}/{d.slice(5, 7)}</div>
                <div style={{ fontSize: 14 }}>{nb} tâche(s)</div>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: "none",
                borderRadius: "0 0 4px 4px", padding: "8px 14px 10px" }}>
                {!lignes.length && <div style={{ fontSize: 14, color: C.gris, padding: "4px 0" }}>Rien de prévu.</div>}
                {lignes.map((x) => <div key={x.zone} style={{ padding: "6px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: ACC }}>{x.zone}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{x.taches.map((t) => t.nom).join(" · ")}</div>
                </div>)}
              </div>
            </div>;
          })}
          {bureau === "BAN" && regimesAcouper.length > 0 && (<>
            <Titre couleur={C.ban}>RÉGIMES À COUPER</Titre>
            {regimesAcouper.map((r) => <Card key={r.id} tone={C.laterite}>
              <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>{r.parc} — ruban {r.ruban}</div>
              <div style={{ fontSize: 15, marginTop: 3 }}>{r.nb - r.coupes} régime(s) · prévu le {r.prevision}
                · environ <b style={{ color: C.laterite }}>{(r.nb - r.coupes) * r.poids} kg</b></div>
            </Card>)}
          </>)}
        </>)}

        {/* ═════ TRAVAUX ═════ */}
        {onglet === "travaux" && (<>
          <Label>{bureau === "LIV" ? "Lieu" : "Zone"}</Label>
          <Select value={tv.zone} onChange={(v) => setTv({ ...tv, zone: v, tache: "", unite: "" })}
            options={LIEUX} placeholder="Choisir" />
          <BlocPlan zone={tv.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(tv.zone)); setOnglet("registres"); setSousPage("references"); }} />
          <Label>Quelle tâche{cultureDe(tv.zone) ? ` — ${cultureDe(tv.zone)}` : ""}</Label>
          <Select value={tv.tache}
            onChange={(v) => setTv({ ...tv, tache: v, unite: unitesPour(v)[0] })}
            options={tachesPour(tv.zone)} placeholder={tv.zone ? "Choisir" : "Choisissez d'abord la zone"} />
          <Label>Combien — le chiffre obligatoire</Label>
          <Compteur value={tv.qte} onChange={(v) => setTv({ ...tv, qte: v })} unite={tv.unite}
            setUnite={(u) => setTv({ ...tv, unite: u })} unites={unitesPour(tv.tache)} />
          <Label>Combien de personnes</Label>
          <Compteur value={tv.personnes} onChange={(v) => setTv({ ...tv, personnes: v })} />
          <Label>Combien d'heures chacune</Label>
          <Compteur value={tv.heures} onChange={(v) => setTv({ ...tv, heures: v })} pas={0.5} />
          <Label>Qui a conduit le travail</Label>
          <ChoixAgent valeur={tv.qui} manuel={tv.quiManuel}
            onValeur={(v) => setTv({ ...tv, qui: v })} onManuel={(v) => setTv({ ...tv, quiManuel: v })} />
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 4, background: "#fff",
            border: `2px solid ${C.laterite}`, fontSize: 15 }}>
            Main-d'œuvre de ce travail : <b style={{ color: C.laterite, fontSize: 19 }}>
              {usd(num(tv.personnes) * num(tv.heures) * (tauxDe(tv.qui) / 8))} {DEVISE}</b>
          </div>
          <Bouton onClick={enregistrerTravail}>Ajouter ce travail</Bouton>
          {travaux.map((t, i) => <Card key={i}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{t.zone} — {t.tache}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}><b style={{ color: C.laterite, fontSize: 19 }}>{t.qte} {t.unite}</b>
              {` · ${t.personnes} pers. × ${t.heures} h`}{t.qui ? ` · ${t.par || courtNom(t.qui)}` : ""}</div>
            <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{usd(t.coutMO)} {DEVISE}</div>
            <Supprimer onClick={() => retirer(travaux, setTravaux, i, "travaux", `${t.zone} — ${t.tache}`)} />
          </Card>)}
        </>)}

        {/* ═════ ENGRAIS ═════ */}
        {onglet === "engrais" && (<>
          <Note>{bureau === "TOM"
            ? <><b>Attention à l'échelle.</b> Le calendrier de fertigation est calculé pour 5 modules.
              Un seul module en production : divisez toutes les doses par 5.</>
            : <><b>Attention à l'échelle.</b> Le calendrier banane est calculé pour 1 hectare.
              Les trois parcs font 0,4 ha au total. Utilisez la dose par pied.</>}</Note>
          <Label>Bac ou mode d'apport</Label>
          <Select value={en.bac} onChange={(v) => setEn({ ...en, bac: v })} options={BACS} placeholder="Choisir" />
          <Label>Zone</Label>
          <Select value={en.zone} onChange={(v) => setEn({ ...en, zone: v })} options={LIEUX} placeholder="Choisir" />
          <BlocPlan zone={en.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(en.zone)); setOnglet("registres"); setSousPage("references"); }} />
          <Label>Volume préparé (litres)</Label>
          <Compteur value={en.volume} onChange={(v) => setEn({ ...en, volume: v })} pas={50} />
          <Titre>PRODUITS DANS CE BAC</Titre>
          {melangeE.map((m, i) => <Card key={i} tone={ACC}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{nomArt(m.articleId)}</div>
            <div style={{ fontSize: 15, marginTop: 2, color: C.laterite, fontWeight: 700 }}>{m.dose}</div>
            <div style={{ fontSize: 13.5, marginTop: 2, color: C.gris }}>
              Sorti du stock : {m.qte} {(art(m.articleId) || {}).unite}
              {art(m.articleId) && art(m.articleId).prix ? ` · ${usd(num(m.qte) * art(m.articleId).prix)} ${DEVISE}` : ""}</div>
            <Supprimer onClick={() => setMelangeE(melangeE.filter((_, k) => k !== i))} />
          </Card>)}
          {conflitBac() && <Alerte>{conflitBac()}</Alerte>}
          <Label>Ajouter un produit</Label>
          <Select value={ligneE.articleId} onChange={(v) => setLigneE({ ...ligneE, articleId: v })}
            options={articlesPour(en.zone, "Engrais")}
            placeholder={en.zone ? "Choisir — liste adaptée à la spéculation" : "Choisissez d'abord la zone"} />
          <Label>Dose exacte appliquée</Label>
          <TextIn value={ligneE.dose} onChange={(v) => setLigneE({ ...ligneE, dose: v })}
            placeholder="4,2 kg dans le bac  /  150 g par pied" />
          <Label>Quantité sortie du stock{ligneE.articleId ? ` (${(art(ligneE.articleId) || {}).unite})` : ""}</Label>
          <Compteur value={ligneE.qte} onChange={(v) => setLigneE({ ...ligneE, qte: v })} pas={0.5} />
          <Bouton tone="ghost" petit onClick={() => {
            if (!ligneE.articleId || !ligneE.dose) { flash("Produit et dose sont obligatoires", 4000); return; }
            setMelangeE([...melangeE, ligneE]); setLigneE({ articleId: "", dose: "", qte: "" });
          }}>+ Ajouter au mélange</Bouton>
          {melangeAzote && cendreProche && <Alerte>
            Cendres épandues sur {en.zone} le {cendreProche}. L'azote sur cendres fraîches part en fumée :
            attendez jusqu'au {plusJours(cendreProche, DELAI_CENDRE_UREE)}.</Alerte>}
          {melangeAzote && !cendreProche && (<>
            <Label>Des cendres ont-elles été épandues ici récemment ?</Label>
            <Select value={en.cendreRecente} onChange={(v) => setEn({ ...en, cendreRecente: v })}
              options={["Non — ou il y a plus de 14 jours", "Oui — moins de 14 jours", "Je ne sais pas"]} placeholder="Répondre" />
          </>)}
          {en.zone && horsCalendrier(en.zone, "Fertigation") && <Alerte tone="amber">
            Le calendrier ne prévoit aucun apport d'engrais sur {en.zone} aujourd'hui. Fertiliser hors
            plan déséquilibre la nutrition et fausse les cumuls. Si c'est une décision de la Direction,
            confirmez-le ci-dessous ; sinon, revenez au calendrier.</Alerte>}
          {en.zone && horsCalendrier(en.zone, "Fertigation") && (<>
            <Label>Apport hors calendrier — confirmez</Label>
            <Select value={en.horsPlan} onChange={(v) => setEn({ ...en, horsPlan: v })}
              options={["Oui — décision de la Direction", "Oui — rattrapage d'un apport manqué", "Non — je corrige"]}
              placeholder="Répondre" />
          </>)}
          <Label>Produits manquants / non appliqués</Label>
          <TextIn value={en.produitsManquants} onChange={(v) => setEn({ ...en, produitsManquants: v })}
            placeholder="Ex. : nitrate de potassium indisponible — 1,1 kg non appliqué" />
          <Note>Ajoutez au mélange uniquement les produits réellement appliqués. Un produit manquant
            n'empêche pas l'enregistrement ; le manquement sera indiqué dans le rapport.</Note>
          <Label>Qui a pesé les doses</Label>
          <ChoixAgent valeur={en.qui} manuel={en.quiManuel}
            onValeur={(v) => setEn({ ...en, qui: v })} onManuel={(v) => setEn({ ...en, quiManuel: v })} />
          <Bouton onClick={enregistrerEngrais}>Enregistrer cet apport</Bouton>
          {engrais.map((e, i) => <Card key={i}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{e.zone} — {e.bac}</div>
            {e.produits.map((p, k) => <div key={k} style={{ fontSize: 15, marginTop: 3 }}>
              {p.nom} — <b style={{ color: C.laterite }}>{p.dose}</b></div>)}
            <div style={{ fontSize: 14, marginTop: 4, color: C.gris }}>
              {e.volume ? `${e.volume} L · ` : ""}{usd(e.cout)} {DEVISE} · {e.par}</div>
            {e.produitsManquants && <Alerte tone="amber">Manquement : {e.produitsManquants}</Alerte>}
            <Supprimer onClick={() => retirer(engrais, setEngrais, i, "engrais", `${e.zone} — ${e.bac}`)} />
          </Card>)}
        </>)}

        {/* ═════ PHYTO ═════ */}
        {onglet === "phyto" && (<>
          <Label>Zone traitée</Label>
          <Select value={ph.zone} onChange={(v) => setPh({ ...ph, zone: v })} options={LIEUX} placeholder="Choisir" />
          {(traitZone[ph.zone] || [])[0] && <Note tone={ACC}>
            Dernier traitement sur {ph.zone} : le {traitZone[ph.zone][0].date}
            {` (il y a ${jours(traitZone[ph.zone][0].date, date)} jours)`} — {traitZone[ph.zone][0].produits.join(" + ")}
          </Note>}
          <BlocPlan zone={ph.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(ph.zone)); setOnglet("registres"); setSousPage("references"); }} />
          <Label>Volume de bouillie (litres)</Label>
          <Compteur value={ph.volume} onChange={(v) => setPh({ ...ph, volume: v })} pas={5} />
          <Titre>PRODUITS DANS LA BOUILLIE</Titre>
          {melangeP.map((m, i) => <Card key={i} tone={C.red}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{nomArt(m.articleId)}</div>
            <div style={{ fontSize: 15, marginTop: 2, color: C.laterite, fontWeight: 700 }}>{m.dose}</div>
            <div style={{ fontSize: 13.5, marginTop: 2, color: C.gris }}>Étiquette : {m.etiquette}
              {m.qte ? ` · ${m.qte} ${(art(m.articleId) || {}).unite} du stock` : ""}</div>
            <Supprimer onClick={() => setMelangeP(melangeP.filter((_, k) => k !== i))} />
          </Card>)}
          {conflitBouillie() && <Alerte>{conflitBouillie()}</Alerte>}
          <Label>Ajouter un produit</Label>
          <Select value={ligneP.articleId} onChange={(v) => setLigneP({ ...ligneP, articleId: v })}
            options={articlesPour(ph.zone, "Phyto").concat(optArticles("Post-récolte"))}
            placeholder={ph.zone ? "Choisir — liste adaptée à la spéculation" : "Choisissez d'abord la zone"} />
          <Label>Nom exact écrit sur l'étiquette</Label>
          <TextIn value={ligneP.etiquette} onChange={(v) => setLigneP({ ...ligneP, etiquette: v })}
            placeholder="Recopiez le nom commercial imprimé sur le bidon" />
          <Label>Dose exacte</Label>
          <TextIn value={ligneP.dose} onChange={(v) => setLigneP({ ...ligneP, dose: v })} placeholder="2,5 g/L  /  1 mL/L" />
          <Label>Quantité sortie du stock{ligneP.articleId ? ` (${(art(ligneP.articleId) || {}).unite})` : ""}</Label>
          <Compteur value={ligneP.qte} onChange={(v) => setLigneP({ ...ligneP, qte: v })} pas={0.1} />
          <Bouton tone="ghost" petit onClick={() => {
            if (!ligneP.articleId || !ligneP.etiquette || !ligneP.dose) { flash("Produit, étiquette et dose sont obligatoires", 4000); return; }
            setMelangeP([...melangeP, ligneP]); setLigneP({ articleId: "", etiquette: "", dose: "", qte: "" });
          }}>+ Ajouter à la bouillie</Bouton>
          <Label>Contre quoi — ce que vous avez vu</Label>
          <TextIn value={ph.cible} onChange={(v) => setPh({ ...ph, cible: v })}
            placeholder="Taches brunes sur les vieilles feuilles, aleurodes, mildiou…" />
          {ph.zone && horsCalendrier(ph.zone, "Phyto") && <Alerte tone="amber">
            Le calendrier ne prévoit aucun traitement sur {ph.zone} aujourd'hui. Traiter hors plan
            accélère les résistances et consomme du produit pour rien. Confirmez ci-dessous s'il s'agit
            d'une intervention décidée sur constat.</Alerte>}
          {ph.zone && horsCalendrier(ph.zone, "Phyto") && (<>
            <Label>Traitement hors calendrier — confirmez</Label>
            <Select value={ph.horsPlan} onChange={(v) => setPh({ ...ph, horsPlan: v })}
              options={["Oui — intervention sur constat au champ", "Oui — rattrapage d'un passage manqué", "Non — je corrige"]}
              placeholder="Répondre" />
          </>)}
          <Label>Qui a préparé la bouillie</Label>
          <ChoixAgent valeur={ph.qui} manuel={ph.quiManuel}
            onValeur={(v) => setPh({ ...ph, qui: v })} onManuel={(v) => setPh({ ...ph, quiManuel: v })} />
          <Label>Récolte de nouveau autorisée à partir du (DAR)</Label>
          <DateIn value={ph.dar} onChange={(v) => setPh({ ...ph, dar: v })} rouge />
          <Bouton onClick={enregistrerPhyto}>Enregistrer ce traitement</Bouton>
          {phyto.map((p, i) => <Card key={i} tone={C.red}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{p.zone}</div>
            {p.produits.map((x, k) => <div key={k} style={{ fontSize: 15, marginTop: 3 }}>
              {x.nom} — <b style={{ color: C.laterite }}>{x.dose}</b></div>)}
            {p.cible && <div style={{ fontSize: 14, marginTop: 4 }}>Cible : {p.cible}</div>}
            {p.dar && <div style={{ fontSize: 14, marginTop: 4, color: C.red, fontWeight: 700 }}>
              Récolte interdite jusqu'au {p.dar}</div>}
            <Supprimer onClick={() => retirer(phyto, setPhyto, i, "phyto", `${p.zone} — traitement`)} />
          </Card>)}
        </>)}

        {/* ═════ MESURES ═════ */}
        {onglet === "mesures" && (<>
          <Note>Ce sont ces chiffres qui permettent de corriger <b>avant</b> que les symptômes
            n'apparaissent. Une valeur hors norme passe en rouge et remonte dans le rapport.</Note>
          <Label>Quelle mesure</Label>
          <Select value={ms.id} onChange={(v) => setMs({ ...ms, id: v })}
            options={MESURES.filter((m) => m.bureau === "*" || m.bureau === bureau)
              .map((m) => ({ v: m.id, t: `${m.nom}${m.unite ? ` (${m.unite})` : ""}` }))} placeholder="Choisir" />
          {ms.id && (() => { const d = MESURES.find((x) => x.id === ms.id); return <>
            {d.aide && <Note tone={C.green2}>{d.aide}</Note>}
            <Label>Valeur relevée — norme {d.min} à {d.max} {d.unite}</Label>
          </>; })()}
          {!ms.id && <Label>Valeur relevée</Label>}
          <TextIn value={ms.valeur} onChange={(v) => setMs({ ...ms, valeur: v })} type="number" placeholder="0" />
          {ms.id && ms.valeur !== "" && mesureHorsNorme(ms) && <Alerte>
            Valeur hors norme. Vérifiez l'appareil, puis corrigez et signalez-le à la Direction.</Alerte>}
          <Label>Où</Label>
          <Select value={ms.zone} onChange={(v) => setMs({ ...ms, zone: v })} options={LIEUX} placeholder="Choisir" />
          <Bouton onClick={enregistrerMesure}>Ajouter cette mesure</Bouton>
          {mesures.map((m, i) => <Card key={i} tone={mesureHorsNorme(m) ? C.red : C.green2}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{m.nom}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>
              <b style={{ color: mesureHorsNorme(m) ? C.red : C.laterite, fontSize: 21 }}>{m.valeur} {m.unite}</b>
              {m.zone ? ` · ${m.zone}` : ""} · {m.h}</div>
            {mesureHorsNorme(m) && <div style={{ fontSize: 14, marginTop: 4, color: C.red, fontWeight: 700 }}>Hors norme</div>}
            <Supprimer onClick={() => retirer(mesures, setMesures, i, "mesures", m.nom)} />
          </Card>)}
        </>)}

        {/* ═════ GAINAGE ═════ */}
        {onglet === "gainage" && (<>
          <Note tone={C.red}><b>Une seule couleur de sac est autorisée : le bleu perforé.</b> Le noir
            et le gris chauffent comme un four autour du régime.</Note>
          <div style={{ background: ACC, color: "#fff", padding: 14, borderRadius: 4, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, letterSpacing: 1.3, fontFamily: OSW }}>RUBAN DE CETTE SEMAINE</div>
            <div style={{ fontSize: 30, fontWeight: 700, fontFamily: OSW }}>{rubanDe(date)}</div>
            <div style={{ fontSize: 13.5, marginTop: 2 }}>Semaine {semaineIso(date)} — posez ce ruban sur
              chaque régime gainé aujourd'hui. C'est lui qui dira quand couper.</div>
          </div>
          <Label>Parc</Label>
          <Select value={ga.zone} onChange={(v) => setGa({ ...ga, zone: v })} options={ZONES.BAN} placeholder="Choisir" />
          <Label>Combien de régimes gainés</Label>
          <Compteur value={ga.nb} onChange={(v) => setGa({ ...ga, nb: v })} />
          <Label>Couleur du sac posé</Label>
          <Select value={ga.couleur} onChange={(v) => setGa({ ...ga, couleur: v })} options={COULEURS_SAC} placeholder="Choisir" />
          <Label>Bourgeon mâle enlevé ?</Label>
          <Select value={ga.bourgeon} onChange={(v) => setGa({ ...ga, bourgeon: v })}
            options={["Oui — cassé à la main", "Non — pas encore", "Sans objet"]} placeholder="Répondre" />
          <Bouton onClick={enregistrerGainage}>Ajouter ce gainage</Bouton>
          {gainage.map((g, i) => <Card key={i} tone={g.couleur.includes("INTERDIT") ? C.red : C.green2}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{g.zone} — ruban {g.ruban}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}><b style={{ color: C.laterite, fontSize: 19 }}>{g.nb} régime(s)</b>
              {g.bourgeon ? ` · ${g.bourgeon}` : ""}</div>
            <div style={{ fontSize: 14, marginTop: 4, fontWeight: 700,
              color: g.couleur.includes("INTERDIT") ? C.red : C.green2 }}>Sac {g.couleur}</div>
            <Supprimer onClick={() => retirer(gainage, setGainage, i, "gainage", `${g.zone} — gainage`)} />
          </Card>)}
        </>)}

        {/* ═════ RÉCOLTE ═════ */}
        {onglet === "recolte" && (<>
          <Stat libelle="Retenu aujourd'hui" valeur={`${totalKg} kg`}
            sous={`Écarté : ${totalEcart} kg · Pertes : ${tauxPerte} %`} couleur={ACC} />
          <Label>Zone récoltée</Label>
          <Select value={rc.zone} onChange={(v) => setRc({ ...rc, zone: v })} options={zonesBureau} placeholder="Choisir" />
          <BlocPlan zone={rc.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(rc.zone)); setOnglet("registres"); setSousPage("references"); }} />
          {darActif(rc.zone) && <Alerte>NE PAS RÉCOLTER sur {rc.zone}. Un traitement y a été appliqué :
            récolte autorisée à partir du {darActif(rc.zone)}.</Alerte>}
          <Label>Kilos retenus — bons pour la vente</Label>
          <Compteur value={rc.kg} onChange={(v) => setRc({ ...rc, kg: v })} />
          {bureau === "BAN" && (<><Label>Nombre de régimes coupés</Label>
            <Compteur value={rc.regimes} onChange={(v) => setRc({ ...rc, regimes: v })} /></>)}
          <Label>Nombre de caisses remplies</Label>
          <Compteur value={rc.caisses} onChange={(v) => setRc({ ...rc, caisses: v })} />
          <Label>Qualité</Label>
          <Select value={rc.qualite} onChange={(v) => setRc({ ...rc, qualite: v })} options={QUALITES} placeholder="Choisir" />
          <Label>Kilos écartés — refusés au tri</Label>
          <Compteur value={rc.ecart} onChange={(v) => setRc({ ...rc, ecart: v })} />
          {num(rc.ecart) > 0 && (<><Label>Pourquoi ils ont été écartés</Label>
            <Select value={rc.motif} onChange={(v) => setRc({ ...rc, motif: v })} options={MOTIFS_ECART} placeholder="Choisir" /></>)}
          <Label>Photos du lot</Label>
          <Photos ids={rc.photos} images={images}
            onAjout={(f) => ajouterPhoto(f, (ids) => setRc({ ...rc, photos: ids }), rc.photos)}
            onRetrait={(id) => setRc({ ...rc, photos: rc.photos.filter((x) => x !== id) })} />
          <Bouton onClick={enregistrerRecolte}>Ajouter cette récolte et créer le lot</Bouton>
          {recoltes.map((r, i) => <Card key={i}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{r.zone} — {r.lot}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}><b style={{ color: C.laterite, fontSize: 19 }}>{r.kg} kg</b>
              {r.regimes ? ` · ${r.regimes} régimes` : ""}{r.caisses ? ` · ${r.caisses} caisses` : ""}
              {r.qualite ? ` · ${r.qualite}` : ""}</div>
            {num(r.ecart) > 0 && <div style={{ fontSize: 14, color: C.red, marginTop: 4 }}>
              Écartés : {r.ecart} kg — {r.motif}</div>}
            {(r.photos || []).length > 0 && <div style={{ marginTop: 8 }}>
              <Photos ids={r.photos} images={images} /></div>}
            <Supprimer onClick={() => retirer(recoltes, setRecoltes, i, "recoltes", `${r.zone} — récolte`)} />
          </Card>)}
        </>)}

        {/* ═════ LIVRAISONS ═════ */}
        {onglet === "livraison" && (<>
          <Stat libelle="Livré aujourd'hui" valeur={`${totalLivKg} kg`} sous={`${usd(totalLivUsd)} ${DEVISE}`} couleur={ACC} />
          <Label>Numéro du bon de livraison</Label>
          <TextIn value={lv.bl} onChange={(v) => setLv({ ...lv, bl: v })} placeholder="Ex. BL-2026-0142" />
          <Label>Client</Label>
          <Select value={lv.client} onChange={(v) => setLv({ ...lv, client: v })} options={CLIENTS} placeholder="Choisir" />
          <Label>Produit livré</Label>
          <Select value={lv.produit} onChange={(v) => setLv({ ...lv, produit: v })} options={PRODUITS_VENDUS} placeholder="Choisir" />
          <Label>Lot d'origine — traçabilité</Label>
          <Select value={lv.lot} onChange={(v) => setLv({ ...lv, lot: v })}
            options={lotsDispo.map((l) => ({ v: l.id, t: `${l.id} — ${l.zone} — ${l.restant} kg restants` }))}
            placeholder={lotsDispo.length ? "Choisir le lot" : "Aucun lot en stock"} />
          <Label>Nombre de caisses</Label>
          <Compteur value={lv.caisses} onChange={(v) => setLv({ ...lv, caisses: v })} />
          <Label>Poids total livré (kg)</Label>
          <Compteur value={lv.kg} onChange={(v) => setLv({ ...lv, kg: v })} />
          {num(lv.caisses) > 0 && num(lv.kg) > 0 && (
            <div style={{ marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 4,
              background: num(lv.kg) / num(lv.caisses) > POIDS_CAISSE_MAX ? C.red : "#fff",
              color: num(lv.kg) / num(lv.caisses) > POIDS_CAISSE_MAX ? "#fff" : C.ink,
              border: `1px solid ${C.line}`, fontSize: 15, fontWeight: 700 }}>
              {Math.round((num(lv.kg) / num(lv.caisses)) * 10) / 10} kg par caisse
              {num(lv.kg) / num(lv.caisses) > POIDS_CAISSE_MAX
                ? ` — au-dessus des ${POIDS_CAISSE_MAX} kg autorisés. Répartissez avant le départ.` : " — conforme."}
            </div>)}
          <Label>Prix unitaire ({DEVISE} par kg)</Label>
          <Compteur value={lv.pu} onChange={(v) => setLv({ ...lv, pu: v })} pas={0.1} />
          <div style={{ marginTop: -4, marginBottom: 14, padding: 14, borderRadius: 4, background: "#fff",
            border: `2px solid ${C.laterite}` }}>
            <div style={{ fontFamily: OSW, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase",
              color: C.green }}>Montant total du bon</div>
            <div style={{ fontFamily: OSW, fontSize: 30, fontWeight: 700, color: C.laterite }}>
              {usd(num(lv.kg) * num(lv.pu))} {DEVISE}</div>
          </div>
          <Label>Nom du réceptionnaire</Label>
          <TextIn value={lv.receptionnaire} onChange={(v) => setLv({ ...lv, receptionnaire: v })}
            placeholder="Nom et fonction de la personne qui reçoit" />
          <Label>Le bon a-t-il été signé ?</Label>
          <Select value={lv.signe} onChange={(v) => setLv({ ...lv, signe: v })}
            options={["Signé — exemplaire ramené au magasin", "Signé — exemplaire resté chez le client",
              "Non signé — client absent", "Non signé — refus de signer"]} placeholder="Répondre" />
          {lv.signe.startsWith("Non") && <Alerte>Un bon non signé n'est pas une preuve de livraison.
            Photographiez le bon et le chargement, et signalez-le à la Direction.</Alerte>}
          <Label>Heure de livraison</Label>
          <TextIn value={lv.h} onChange={(v) => setLv({ ...lv, h: v })} placeholder="Ex. 10h30" />
          <Bouton onClick={enregistrerLivraison}>Enregistrer ce bon</Bouton>
          {livraisons.map((l, i) => {
            const pc = num(l.caisses) ? Math.round((num(l.kg) / num(l.caisses)) * 10) / 10 : 0;
            const ko = pc > POIDS_CAISSE_MAX || l.signe.startsWith("Non");
            return <Card key={i} tone={ko ? C.red : C.green2}>
              <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>BL n° {l.bl} — {l.client}</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>{l.produit} · {l.caisses || "?"} caisses ·
                <b style={{ color: C.laterite }}> {l.kg} kg</b> · {usd(num(l.kg) * num(l.pu))} {DEVISE}</div>
              {l.lot && <div style={{ fontSize: 14, marginTop: 2 }}>Lot {l.lot}</div>}
              <div style={{ fontSize: 14, marginTop: 4, color: C.gris }}>
                {pc ? `${pc} kg/caisse · ` : ""}Reçu par {l.receptionnaire}{l.h ? ` · ${l.h}` : ""}</div>
              <div style={{ fontSize: 14, marginTop: 4, fontWeight: 700, color: ko ? C.red : C.green2 }}>{l.signe}</div>
              <Supprimer onClick={() => retirer(livraisons, setLivraisons, i, "livraisons", `BL ${l.bl}`)} />
            </Card>;
          })}
        </>)}


        {/* ═════ ALIMENTATION VOLAILLE ═════ */}
        {onglet === "aliment" && (<>
          {AVI_A_VALIDER && <Note tone={C.amber}>Aucun plan avicole validé ne figure au dossier.
            Les aliments et les âges proposés ici sont les références techniques standard :
            <b> à faire valider par la Direction</b> avant d'être imposés à l'équipe.</Note>}
          <Label>Bâtiment</Label>
          <Select value={al.zone} onChange={(v) => setAl({ ...al, zone: v, articleId: "" })}
            options={ZONES.AVI} placeholder="Choisir" />
          <BlocPlan zone={al.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(al.zone)); setOnglet("registres"); setSousPage("references"); }} />
          {alimentDuJour(al.zone) && <div style={{ background: ACC, color: "#fff", padding: 14,
            borderRadius: 4, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, letterSpacing: 1.3, fontFamily: OSW }}>ALIMENT PRÉVU À CET ÂGE</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: OSW, lineHeight: 1.2 }}>
              {nomArt(alimentDuJour(al.zone).article)}</div>
            <div style={{ fontSize: 13.5, marginTop: 3 }}>{alimentDuJour(al.zone).libelle}</div>
          </div>}
          <Label>Aliment distribué</Label>
          <Select value={al.articleId} onChange={(v) => setAl({ ...al, articleId: v })}
            options={articlesPour(al.zone, "Aliment")} placeholder="Choisir" />
          {alimentHorsAge && <Alerte>
            Cet aliment n'est pas celui prévu à J+{ageDe(al.zone)}. Donner un aliment qui ne correspond
            pas à l'âge coûte de la croissance et provoque des diarrhées. Si c'est une transition,
            indiquez-le ci-dessous ; sinon, changez d'aliment.</Alerte>}
          {alimentHorsAge && (<>
            <Label>S'agit-il d'une transition d'aliment ?</Label>
            <Select value={al.transition} onChange={(v) => setAl({ ...al, transition: v })}
              options={["Oui — transition progressive sur 3 jours", "Non"]} placeholder="Répondre" />
          </>)}
          <Label>Quantité distribuée (kg)</Label>
          <Compteur value={al.kg} onChange={(v) => setAl({ ...al, kg: v })} pas={5} />
          {al.zone && cultures[al.zone] && num(cultures[al.zone].effectif) > 0 && num(al.kg) > 0 &&
            <div style={{ marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 4, background: "#fff",
              border: `1px solid ${C.line}`, fontSize: 15 }}>
              Soit <b style={{ color: C.laterite }}>
                {Math.round((num(al.kg) * 1000) / num(cultures[al.zone].effectif))} g par sujet</b> pour
              {" "}{cultures[al.zone].effectif} sujets.</div>}
          <Label>Eau — abreuvoirs</Label>
          <Select value={al.eau} onChange={(v) => setAl({ ...al, eau: v })}
            options={["Propres et pleins", "Nettoyés ce matin", "Problème d'eau — signaler"]} placeholder="Répondre" />
          <Label>Qui a distribué</Label>
          <ChoixAgent valeur={al.qui} manuel={al.quiManuel}
            onValeur={(v) => setAl({ ...al, qui: v })} onManuel={(v) => setAl({ ...al, quiManuel: v })} />
          <Bouton onClick={enregistrerAliment}>Enregistrer la distribution</Bouton>
          {alimentation.map((a, i) => <Card key={i}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{a.zone} — {nomArt(a.articleId)}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}><b style={{ color: C.laterite, fontSize: 19 }}>{a.kg} kg</b>
              {a.eau ? ` · eau : ${a.eau}` : ""}</div>
            <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{usd(a.cout)} {DEVISE} · {a.par}</div>
            <Supprimer onClick={() => retirer(alimentation, setAlimentation, i, "alimentation", `${a.zone} — aliment`)} />
          </Card>)}
        </>)}

        {/* ═════ PONTE ═════ */}
        {onglet === "ponte" && (<>
          <Stat libelle="Œufs ramassés aujourd'hui" valeur={totalOeufs}
            sous={`${totalCasses} cassé(s) · ${totalSales} sale(s)${tauxPonte !== null ? ` · taux de ponte ${tauxPonte} %` : ""}`}
            couleur={ACC} />
          <Label>Bâtiment</Label>
          <Select value={po.zone} onChange={(v) => setPo({ ...po, zone: v })} options={ZONES.AVI} placeholder="Choisir" />
          <BlocPlan zone={po.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(po.zone)); setOnglet("registres"); setSousPage("references"); }} />
          <Label>Œufs propres — bons pour la vente</Label>
          <Compteur value={po.oeufs} onChange={(v) => setPo({ ...po, oeufs: v })} pas={10} />
          <Label>Œufs sales</Label>
          <Compteur value={po.sales} onChange={(v) => setPo({ ...po, sales: v })} />
          <Label>Œufs cassés</Label>
          <Compteur value={po.casses} onChange={(v) => setPo({ ...po, casses: v })} />
          {num(po.casses) > 0 && <Note tone={C.amber}>Des œufs cassés en nombre signalent souvent un
            manque de calcium, un ramassage trop espacé ou des pondoirs sales. Notez-le dans les problèmes
            si cela se répète.</Note>}
          <Label>Ramassages effectués aujourd'hui</Label>
          <Compteur value={po.ramassages} onChange={(v) => setPo({ ...po, ramassages: v })} />
          <Label>Qui a ramassé</Label>
          <ChoixAgent valeur={po.qui} manuel={po.quiManuel}
            onValeur={(v) => setPo({ ...po, qui: v })} onManuel={(v) => setPo({ ...po, quiManuel: v })} />
          <Bouton onClick={enregistrerPonte}>Enregistrer la ponte</Bouton>
          {ponte.map((x, i) => <Card key={i}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{x.zone}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}><b style={{ color: C.laterite, fontSize: 19 }}>{x.oeufs} œufs</b>
              {x.sales ? ` · ${x.sales} sales` : ""}{x.casses ? ` · ${x.casses} cassés` : ""}</div>
            <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>
              {x.ramassages ? `${x.ramassages} ramassage(s) · ` : ""}{x.par}</div>
            <Supprimer onClick={() => retirer(ponte, setPonte, i, "ponte", `${x.zone} — ponte`)} />
          </Card>)}
        </>)}

        {/* ═════ CHEPTEL ═════ */}
        {onglet === "cheptel" && (<>
          {totalMorts > 0 && <Alerte>{totalMorts} mortalité(s) aujourd'hui. Au-delà de 1 % de la bande
            en une journée, prévenez la Direction immédiatement et isolez le bâtiment.</Alerte>}
          <Label>Bâtiment</Label>
          <Select value={ch.zone} onChange={(v) => setCh({ ...ch, zone: v })} options={ZONES.AVI} placeholder="Choisir" />
          {ch.zone && cultures[ch.zone] && <Note tone={ACC}>
            {cultures[ch.zone].type} · J+{ageDe(ch.zone)} · effectif au registre : <b>{cultures[ch.zone].effectif || "non renseigné"}</b></Note>}
          <Label>Mortalités du jour</Label>
          <Compteur value={ch.morts} onChange={(v) => setCh({ ...ch, morts: v })} />
          {num(ch.morts) > 0 && (<><Label>Cause présumée</Label>
            <Select value={ch.cause} onChange={(v) => setCh({ ...ch, cause: v })}
              options={["Écrasement", "Maladie", "Chaleur", "Froid", "Prédateur", "Accident", "Inconnue"]}
              placeholder="Choisir" /></>)}
          <Label>Éclosions / naissances du jour</Label>
          <Compteur value={ch.naissances} onChange={(v) => setCh({ ...ch, naissances: v })} />
          <Label>Sujets vendus ou enlevés</Label>
          <Compteur value={ch.sorties} onChange={(v) => setCh({ ...ch, sorties: v })} />
          <Label>Poids vif total sorti (kg)</Label>
          <Compteur value={ch.kg} onChange={(v) => setCh({ ...ch, kg: v })} />
          <Label>Poids moyen d'un échantillon de 20 sujets (g)</Label>
          <Compteur value={ch.poidsMoyen} onChange={(v) => setCh({ ...ch, poidsMoyen: v })} pas={50} />
          <Bouton onClick={enregistrerCheptel}>Enregistrer le comptage</Bouton>
          {cheptel.map((x, i) => <Card key={i} tone={num(x.morts) > 0 ? C.red : C.green2}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{x.zone}</div>
            {num(x.morts) > 0 && <div style={{ fontSize: 15, marginTop: 4, color: C.red, fontWeight: 700 }}>
              {x.morts} mortalité(s){x.cause ? ` — ${x.cause}` : ""}</div>}
            {num(x.naissances) > 0 && <div style={{ fontSize: 15, marginTop: 3 }}>+{x.naissances} éclosion(s)</div>}
            {num(x.sorties) > 0 && <div style={{ fontSize: 15, marginTop: 3 }}>{x.sorties} sujet(s) sortis
              {num(x.kg) ? ` — ${x.kg} kg vif` : ""}</div>}
            {num(x.poidsMoyen) > 0 && <div style={{ fontSize: 14, marginTop: 3, color: C.gris }}>
              Poids moyen {x.poidsMoyen} g</div>}
            <Supprimer onClick={() => retirer(cheptel, setCheptel, i, "cheptel", `${x.zone} — cheptel`)} />
          </Card>)}
        </>)}

        {/* ═════ SANTÉ ANIMALE ═════ */}
        {onglet === "sante" && (<>
          <Label>Bâtiment</Label>
          <Select value={sa.zone} onChange={(v) => setSa({ ...sa, zone: v })} options={ZONES.AVI} placeholder="Choisir" />
          <BlocPlan zone={sa.zone} cultures={cultures} date={date} couleur={ACC}
            onOuvrir={() => { setRefCulture(cultureDe(sa.zone)); setOnglet("registres"); setSousPage("references"); }} />
          <Label>Type d'intervention</Label>
          <Select value={sa.type} onChange={(v) => setSa({ ...sa, type: v })}
            options={["Vaccination", "Déparasitage", "Anticoccidien", "Vitamines / anti-stress",
              "Antibiotique sur prescription", "Désinfection du bâtiment", "Autre"]} placeholder="Choisir" />
          <Label>Produit utilisé</Label>
          <Select value={sa.articleId} onChange={(v) => setSa({ ...sa, articleId: v })}
            options={articlesPour(sa.zone, "Vétérinaire")} placeholder="Choisir dans le stock" />
          <Label>Nom exact écrit sur le flacon</Label>
          <TextIn value={sa.etiquette} onChange={(v) => setSa({ ...sa, etiquette: v })}
            placeholder="Recopiez le nom et le numéro de lot du flacon" />
          <Label>Nombre de sujets traités</Label>
          <Compteur value={sa.sujets} onChange={(v) => setSa({ ...sa, sujets: v })} pas={10} />
          <Label>Quantité sortie du stock{sa.articleId ? ` (${(art(sa.articleId) || {}).unite})` : ""}</Label>
          <Compteur value={sa.qte} onChange={(v) => setSa({ ...sa, qte: v })} pas={10} />
          <Label>Délai d'attente — vente autorisée à partir du</Label>
          <DateIn value={sa.delai} onChange={(v) => setSa({ ...sa, delai: v })} rouge />
          <Label>Qui a fait l'intervention</Label>
          <ChoixAgent valeur={sa.qui} manuel={sa.quiManuel}
            onValeur={(v) => setSa({ ...sa, qui: v })} onManuel={(v) => setSa({ ...sa, quiManuel: v })} />
          <Bouton onClick={enregistrerSante}>Enregistrer l'intervention</Bouton>
          {sante.map((x, i) => <Card key={i} tone={C.red}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600 }}>{x.zone} — {x.type}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{nomArt(x.articleId)}
              {x.sujets ? ` · ${x.sujets} sujets` : ""}</div>
            {x.etiquette && <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>Flacon : {x.etiquette}</div>}
            {x.delai && <div style={{ fontSize: 14, marginTop: 4, color: C.red, fontWeight: 700 }}>
              Vente interdite jusqu'au {x.delai}</div>}
            <Supprimer onClick={() => retirer(sante, setSante, i, "sante", `${x.zone} — ${x.type}`)} />
          </Card>)}
        </>)}



        {/* ═════ DEMANDES / RÉQUISITIONS ═════ */}
        {onglet === "demandes" && (<>
          <Note>Toute sortie de stock importante, tout achat et tout décaissement passe par une
            demande écrite. Elle part automatiquement vers la personne qui a le pouvoir de l'engager :
            au-delà de son plafond, elle remonte à la Direction.</Note>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: aMonAction.length ? C.laterite : "#fff",
              color: aMonAction.length ? "#fff" : C.ink, border: `1px solid ${C.line}`, borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 12, fontFamily: OSW, letterSpacing: 1 }}>À MA SIGNATURE</div>
              <div style={{ fontSize: 26, fontFamily: OSW, fontWeight: 700 }}>{aMonAction.length}</div>
            </div>
            <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 12, fontFamily: OSW, letterSpacing: 1, color: C.gris }}>MES DEMANDES</div>
              <div style={{ fontSize: 26, fontFamily: OSW, fontWeight: 700 }}>{mesDemandes.length}</div>
            </div>
            <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 12, fontFamily: OSW, letterSpacing: 1, color: C.gris }}>MON PLAFOND</div>
              <div style={{ fontSize: 20, fontFamily: OSW, fontWeight: 700 }}>{usd(monPlafond)}</div>
            </div>
          </div>

          <Titre couleur={ACC}>NOUVELLE DEMANDE</Titre>
          <Label>Type de demande</Label>
          <Select value={de.type} onChange={(v) => setDe({ ...de, type: v })} options={TYPES_DEMANDE} placeholder="Choisir" />
          <Label>Objet — en une ligne</Label>
          <TextIn value={de.objet} onChange={(v) => setDe({ ...de, objet: v })}
            placeholder="Ex. 4 sacs de mancozèbe pour le traitement Sigatoka du Parc 2" />
          {de.type === "Sortie de stock" && (<>
            <Label>Article demandé</Label>
            <Select value={de.articleId} onChange={(v) => setDe({ ...de, articleId: v })}
              options={optArticles("")} placeholder="Choisir dans le catalogue" />
            <Label>Quantité{de.articleId ? ` (${(art(de.articleId) || {}).unite})` : ""}</Label>
            <Compteur value={de.qte} onChange={(v) => setDe({ ...de, qte: v })} />
            {de.articleId && <div style={{ marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 4,
              background: "#fff", border: `1px solid ${C.line}`, fontSize: 15 }}>
              Stock actuel : <b>{(art(de.articleId) || {}).stock} {(art(de.articleId) || {}).unite}</b> ·
              valeur de la demande : <b style={{ color: C.laterite }}>{usd(num(de.qte) * (art(de.articleId) || {}).prix)} {DEVISE}</b></div>}
          </>)}
          {de.type === "Création d'un nouvel article" && (<>
            <Label>Spécification exacte</Label>
            <TextIn value={de.specification} onChange={(v) => setDe({ ...de, specification: v })} lines={3}
              placeholder="Nom commercial, matière active ou composition, conditionnement, unité de gestion, fournisseur pressenti" />
            <Label>Unité de gestion</Label>
            <Select value={de.unite} onChange={(v) => setDe({ ...de, unite: v })}
              options={["kg", "L", "sac", "unité", "dose", "rouleau", "m", "pcs"]} placeholder="Choisir" />
          </>)}
          {(de.type === "Demande de caisse" || de.type === "Achat / réapprovisionnement"
            || de.type === "Réparation / intervention" || de.type === "Autre besoin") && (<>
            <Label>Montant demandé ({DEVISE})</Label>
            <Compteur value={de.montant} onChange={(v) => setDe({ ...de, montant: v })} pas={5} />
          </>)}
          <Label>Centre de coûts</Label>
          <Select value={de.centre} onChange={(v) => setDe({ ...de, centre: v })}
            options={CENTRES.map((c) => ({ v: c.code, t: `${c.code} — ${c.nom}` }))}
            placeholder={`Par défaut : ${centreAuto("")} — frais généraux`} />
          <Label>Urgence</Label>
          <Select value={de.urgence} onChange={(v) => setDe({ ...de, urgence: v })} options={URGENCES} placeholder="Choisir" />
          <Label>Motif — pourquoi c'est nécessaire</Label>
          <TextIn value={de.motif} onChange={(v) => setDe({ ...de, motif: v })} lines={3}
            placeholder="Ce que le travail exige, ce qui se passe si la demande n'est pas servie" />
          {num(de.montant) > monPlafond && monPlafond > 0 && <Note tone={C.amber}>
            {usd(de.montant)} {DEVISE} dépasse votre plafond de {usd(monPlafond)} {DEVISE} :
            la demande remontera directement à la Direction.</Note>}
          <Bouton onClick={creerDemande}>Créer la demande</Bouton>

          <Titre couleur={ACC}>DEMANDES EN COURS</Titre>
          {!demandes.length && <div style={{ fontSize: 15, color: C.gris }}>Aucune demande enregistrée.</div>}
          {demandes.slice(0, 25).map((d) => {
            const m = montantDemande(d), ouvert = vueDemande === d.id;
            const tone = d.statut === "À valider" ? C.amber : d.statut === "Refusée" ? C.red
              : d.statut === "Servie" || d.statut === "Clôturée" ? C.gris : C.green2;
            return <Card key={d.id} tone={tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontFamily: OSW, fontSize: 16.5, fontWeight: 700 }}>{d.id}</div>
                <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700, color: C.laterite }}>{usd(m)} {DEVISE}</div>
              </div>
              <div style={{ fontSize: 15, marginTop: 3 }}>{d.type} — {d.objet}</div>
              <div style={{ fontSize: 13.5, marginTop: 3, color: C.gris }}>
                {d.demandeur} · {d.centre} · {d.urgence}</div>
              <div style={{ fontSize: 14, marginTop: 4, fontWeight: 700, color: tone }}>
                {d.statut}{d.statut === "À valider" ? ` — chez ${courtNom(d.validateur)}` : ""}</div>
              <button onClick={() => setVueDemande(ouvert ? "" : d.id)}
                style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: C.liv,
                  fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                {ouvert ? "Replier" : "Ouvrir la demande"}</button>
              {ouvert && <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                <div style={{ fontSize: 14.5, lineHeight: 1.55, marginBottom: 10 }}>{d.motif}</div>
                {d.specification && <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 10, color: C.gris }}>
                  {d.specification}</div>}
                {(d.historique || []).map((h, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>
                  {h.date} — <b>{h.par}</b> ({h.role}) : {h.decision}{h.commentaire ? ` — ${h.commentaire}` : ""}</div>)}
                {d.statut === "À valider" && peutValider(d) && (<>
                  <Label>Commentaire ou motif du refus</Label>
                  <Select value={decision[d.id] || ""} onChange={(v) => setDecision({ ...decision, [d.id]: v })}
                    options={MOTIFS_REFUS} placeholder="Optionnel pour valider, obligatoire pour refuser" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => traiterDemande(d.id, "Validée")}
                      style={{ flex: 2, padding: 14, background: C.green, color: "#fff", border: "none",
                        borderRadius: 4, fontFamily: OSW, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>VALIDER</button>
                    <button onClick={() => traiterDemande(d.id, "Refusée")}
                      style={{ flex: 1, padding: 14, background: "#fff", color: C.red, border: `2px solid ${C.red}`,
                        borderRadius: 4, fontFamily: OSW, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>REFUSER</button>
                  </div>
                </>)}
                {d.statut === "À valider" && !peutValider(d) && <Note tone={C.gris}>
                  Cette demande attend la signature de {courtNom(d.validateur)}. Vous ne pouvez pas l'engager
                  à sa place — c'est le principe de la délégation d'autorité.</Note>}
                {d.statut === "Validée" && <Bouton petit onClick={() => traiterDemande(d.id, "Servie")}>
                  Marquer servie{d.type === "Sortie de stock" ? " et sortir du stock" : ""}</Bouton>}
                <div style={{ marginTop: 10 }}>
                  <Bouton petit tone="wa" onClick={() => envoyerWhatsApp(texteDemande(d), d.id)}>WhatsApp</Bouton>
                  <Bouton petit tone="mail" onClick={() => envoyerMail(emailSuperieur, emailDe("Christophe LOSEMBE — Direction"),
                    `Demande ${d.id} — ${d.type} — D'Tomate`, texteDemande(d), d.id)}>
                    Au supérieur — copie Direction</Bouton>
                  <Bouton petit tone="ghost" onClick={() => envoyerMail(emailDe("Christophe LOSEMBE — Direction"), "",
                    `Demande ${d.id} — ${d.type} — D'Tomate`, texteDemande(d), d.id)}>
                    À la Direction seule</Bouton>
                </div>
              </div>}
            </Card>;
          })}
        </>)}


        {/* ═════ PROBLÈMES ═════ */}
        {onglet === "soucis" && (<>
          <Note tone={C.red}><b>Écrivez tout ce qui n'est pas normal</b>, même si vous ne savez pas ce
            que c'est. Ce n'est pas à vous de savoir — c'est à vous de signaler. Une photo vaut mieux
            qu'une longue description.</Note>
          <Label>Où</Label>
          <Select value={pb.ou} onChange={(v) => setPb({ ...pb, ou: v })} options={LIEUX} placeholder="Choisir" />
          <Label>Ce que vous avez vu</Label>
          <TextIn value={pb.quoi} onChange={(v) => setPb({ ...pb, quoi: v })} lines={3}
            placeholder="Exemple : rang 4 du Module 1, 20 plants avec des taches brunes sur les feuilles du bas" />
          <Label>Gravité</Label>
          <Select value={pb.gravite} onChange={(v) => setPb({ ...pb, gravite: v })}
            options={["À surveiller", "Sérieux — à traiter cette semaine", "Urgent — prévenir la Direction aujourd'hui"]}
            placeholder="Choisir" />
          <Label>Photos</Label>
          <Photos ids={pb.photos} images={images}
            onAjout={(f) => ajouterPhoto(f, (ids) => setPb({ ...pb, photos: ids }), pb.photos)}
            onRetrait={(id) => setPb({ ...pb, photos: pb.photos.filter((x) => x !== id) })} />
          <Bouton tone="danger" onClick={() => ajouter(!pb.ou || !pb.quoi ? "Indiquez où et ce que vous avez vu" : "",
            problemes, setProblemes, "problemes", pb, () => setPb(vPb), `${pb.ou} — problème`)}>Signaler ce problème</Bouton>
          {problemes.map((p, i) => <Card key={i} tone={C.red}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 600, color: C.red }}>{p.ou}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{p.quoi}</div>
            {p.gravite && <div style={{ fontSize: 14, marginTop: 4, fontWeight: 700 }}>{p.gravite}</div>}
            {(p.photos || []).length > 0 && <div style={{ marginTop: 8 }}><Photos ids={p.photos} images={images} /></div>}
            <Supprimer onClick={() => retirer(problemes, setProblemes, i, "problemes", `${p.ou} — problème`)} />
          </Card>)}
        </>)}

        {/* ═════ RAPPORT ═════ */}
        {onglet === "rapport" && (<>
          <Bouton tone="wa" onClick={() => envoyerWhatsApp(rapport(), `Rapport ${NOM_BUREAU} ${date}`)}>
            Envoyer sur WhatsApp</Bouton>
          <div style={{ fontSize: 13.5, marginTop: -4, marginBottom: 14, lineHeight: 1.5, color: C.gris }}>
            WhatsApp s'ouvre avec le texte prêt. Choisissez le groupe <b>D'Tomate — {NOM_BUREAU}</b>, puis envoyez.
            Les photos se joignent à la main.</div>
          <Bouton tone="mail" onClick={() => envoyerMail(emailSuperieur, emailDe("Christophe LOSEMBE — Direction"),
            `Rapport journalier ${NOM_BUREAU} — D'Tomate — ${date}`, rapport(), `Rapport ${date} au supérieur`)}>
            E-mail au supérieur — copie Direction</Bouton>
          <div style={{ fontSize: 13.5, marginTop: -4, marginBottom: 14, lineHeight: 1.5, color: C.gris }}>
            {superieurDe(agent)
              ? <>Part à <b>{courtNom(superieurDe(agent))}</b>{emailSuperieur ? ` (${emailSuperieur})` : " — adresse non renseignée"},
                  avec la Direction en copie.</>
              : <>Vous êtes au sommet de la hiérarchie : ce bouton n'a pas de destinataire.</>}
          </div>
          <Bouton tone="mail" onClick={() => envoyerMail(emailDe("Christophe LOSEMBE — Direction"), "",
            `Rapport journalier ${NOM_BUREAU} — D'Tomate — ${date}`, rapport(), `Rapport ${date} à la Direction`)}>
            E-mail à la Direction seule</Bouton>
          <Bouton tone="ghost" onClick={() => copier(rapport())}>Copier le texte</Bouton>
          <pre style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, padding: 14,
            fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "Inter, monospace",
            color: C.ink, overflowX: "auto" }}>{rapport()}</pre>
          <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer" }}>Voir le rapport détaillé du carnet</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{rapportDetaille()}</pre>
          </details>
        </>)}

        {/* ═════ REGISTRES — MENU ═════ */}
        {onglet === "registres" && !sousPage && (<>
          <Note>Tout ce qui ne se saisit pas chaque jour : les registres permanents de la ferme.</Note>
          {alertesStock > 0 && <Alerte>{alertesStock} alerte(s) de stock en cours —
            ruptures, seuils ou péremptions. Ouvrez « Alertes du stock ».</Alerte>}
          {aMonAction.length > 0 && <Alerte tone="amber">{aMonAction.length} demande(s) attendent
            votre signature. Ouvrez l'onglet Demandes.</Alerte>}
          {REGISTRES.map(([k, titre, sous]) => (
            <button key={k} onClick={() => setSousPage(k)}
              style={{ width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${C.line}`,
                borderLeft: `5px solid ${ACC}`, borderRadius: 4, padding: 14, marginBottom: 10, cursor: "pointer" }}>
              <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>{titre}</div>
              <div style={{ fontSize: 14, marginTop: 3, color: C.gris }}>{sous}
                {k === "alertes" && alertesStock > 0 ? ` — ${alertesStock} en cours` : ""}
                {k === "controle" && anomalies.length > 0 ? ` — ${anomalies.length} écart(s)` : ""}</div>
            </button>))}
          <Titre couleur={C.gris}>VERSION DE L'APPLICATION</Titre>
          <Card tone={C.gris}>
            <div style={{ fontFamily: OSW, fontSize: 20, fontWeight: 700 }}>Carnet de ferme v{APP_VERSION}</div>
            <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{APP_DATE} · {ENTITE}</div>
            <div style={{ marginTop: 10 }}>
              {HISTORIQUE_VERSIONS.map(([v, t]) => (
                <div key={v} style={{ padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontFamily: OSW, fontSize: 15, fontWeight: 700,
                    color: v === APP_VERSION ? C.laterite : C.ink }}>v{v}</div>
                  <div style={{ fontSize: 14, marginTop: 2, lineHeight: 1.5 }}>{t}</div>
                </div>))}
            </div>
          </Card>
        </>)}

        {/* ═════ CULTURES ═════ */}
        {sousPage === "cultures" && (<>
          <Note>Une zone ne porte qu'<b>une seule culture à la fois</b>. Pour en installer une nouvelle,
            il faut d'abord clôturer le cycle en cours : c'est ce qui archive le bilan et remet les
            compteurs à zéro.</Note>
          <Titre>CULTURES EN PLACE</Titre>
          {!zonesBureau.some((z) => cultures[z]) && <div style={{ fontSize: 15, color: C.gris, marginBottom: 14 }}>
            Aucune culture installée dans cette section.</div>}
          {zonesBureau.filter((z) => cultures[z]).map((z) => {
            const c = cultures[z], j = jours(c.debut, date), b = bilanZone(z);
            return <Card key={z} tone={c.aConfirmer ? C.amber : ACC}>
              <div style={{ fontFamily: OSW, fontSize: 18, fontWeight: 700 }}>{z} — {c.type}</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>Départ ({CULTURES[c.type].depart}) le {c.debut} ·
                <b style={{ color: C.laterite }}> J+{j}</b> · {phaseDe(c.type, j)}</div>
              {c.effectif && <div style={{ fontSize: 14, marginTop: 2 }}>{c.effectif} plants</div>}
              {c.note && <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{c.note}</div>}
              {b.kg > 0 && <div style={{ fontSize: 14, marginTop: 4 }}>Cumul : {b.kg} kg · {usd(b.total)} {DEVISE} de charges</div>}
              {c.aConfirmer && <div style={{ fontSize: 14, marginTop: 4, color: C.amber, fontWeight: 700 }}>
                Date de départ à confirmer</div>}
              <Supprimer texte="Clôturer ce cycle et libérer la zone" onClick={() => cloturerCulture(z)} />
            </Card>;
          })}
          <Titre>INSTALLER UNE CULTURE</Titre>
          {!zonesLibres.length ? <Note tone={C.gris}>Toutes les zones portent une culture. Clôturez un
            cycle pour libérer une zone.</Note> : (<>
            <Label>Zone libre</Label>
            <Select value={cu.zone} onChange={(v) => setCu({ ...cu, zone: v })} options={zonesLibres} placeholder="Choisir" />
            <Label>Culture</Label>
            <Select value={cu.type} onChange={(v) => setCu({ ...cu, type: v })} options={typesPourBureau} placeholder="Choisir" />
            <Label>Date de départ{cu.type ? ` (${CULTURES[cu.type].depart})` : ""}</Label>
            <DateIn value={cu.debut} onChange={(v) => setCu({ ...cu, debut: v })} />
            <Label>Nombre de plants</Label>
            <Compteur value={cu.effectif} onChange={(v) => setCu({ ...cu, effectif: v })} pas={50} />
            <Label>Note</Label>
            <TextIn value={cu.note} onChange={(v) => setCu({ ...cu, note: v })} placeholder="Origine des plants, densité, remarque" />
            <Bouton onClick={installerCulture}>Installer cette culture</Bouton>
          </>)}
          {archives.length > 0 && (<>
            <Titre>CYCLES CLÔTURÉS</Titre>
            {archives.slice(0, 12).map((a, i) => <Card key={i} tone={C.gris}>
              <div style={{ fontSize: 15 }}><b>{a.zone}</b> — {a.type}</div>
              <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{a.debut} → {a.fin}
                ({jours(a.debut, a.fin)} jours) · clôturé par {a.par}</div>
              {a.bilan && a.bilan.kg > 0 && <div style={{ fontSize: 14, marginTop: 2 }}>
                {a.bilan.kg} kg · {usd((a.bilan.coutIntrant || 0) + (a.bilan.coutMO || 0))} {DEVISE} de charges</div>}
            </Card>)}
          </>)}
        </>)}

        {/* ═════ STOCK ═════ */}
        {sousPage === "stock" && (<>
          <Stat libelle="Valeur du stock" valeur={`${usd(valeurStock)} ${DEVISE}`}
            sous={`${articles.filter((a) => a.stock > 0).length} article(s) en stock`} couleur={C.laterite} />
          {sansPrix.length > 0 && <Alerte tone="amber">{sansPrix.length} article(s) en stock sans prix unitaire.
            Tant qu'ils n'ont pas de prix, les coûts de production sont faux.</Alerte>}
          {alertesStock > 0 && <Bouton tone="danger" onClick={() => setSousPage("alertes")}>
            {alertesStock} alerte(s) de stock — voir le détail</Bouton>}
          {nonReferences.length > 0 && <Note tone={C.gris}>
            {nonReferences.length} article(s) du catalogue n'ont jamais été approvisionnés. Ils ne
            déclenchent aucune alerte tant qu'ils n'ont pas reçu une première entrée ou un prix.</Note>}
          <Titre>ENTRÉE EN STOCK</Titre>
          <Label>Article</Label>
          <Select value={ar.id} onChange={(v) => setAr({ ...ar, id: v })} options={optArticles("")} placeholder="Choisir" />
          <Label>Quantité reçue{ar.id ? ` (${(art(ar.id) || {}).unite})` : ""}</Label>
          <Compteur value={ar.qte} onChange={(v) => setAr({ ...ar, qte: v })} />
          <Label>Prix unitaire payé ({DEVISE}) — laisser vide pour garder l'ancien</Label>
          <TextIn value={ar.prix} onChange={(v) => setAr({ ...ar, prix: v })} type="number" placeholder="0.00" />
          <Label>Date de péremption</Label>
          <DateIn value={ar.peremption} onChange={(v) => setAr({ ...ar, peremption: v })} />
          <Label>Fournisseur / référence de la facture</Label>
          <TextIn value={ar.motif} onChange={(v) => setAr({ ...ar, motif: v })} placeholder="Nom du fournisseur, n° de facture" />
          <Bouton onClick={entreeStock}>Enregistrer l'entrée</Bouton>
          <Titre>INVENTAIRE</Titre>
          {CAT_ARTICLES.map((cat) => {
            const l = articles.filter((a) => a.cat === cat);
            if (!l.length) return null;
            return <div key={cat}>
              <div style={{ fontFamily: OSW, fontSize: 15, fontWeight: 700, color: ACC, margin: "14px 0 8px",
                letterSpacing: 0.8, textTransform: "uppercase" }}>{cat}</div>
              {l.map((a) => <Card key={a.id} tone={a.seuil > 0 && a.stock < a.seuil ? C.red : a.stock > 0 ? C.green2 : C.gris}>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.nom}</div>
                <div style={{ fontSize: 15, marginTop: 3 }}>
                  <b style={{ color: a.seuil > 0 && a.stock < a.seuil ? C.red : C.laterite, fontSize: 19 }}>
                    {a.stock} {a.unite}</b>
                  <span style={{ color: C.gris }}> · seuil {a.seuil} · {usd(a.stock * a.prix)} {DEVISE}</span></div>
                {a.peremption && <div style={{ fontSize: 13.5, marginTop: 2,
                  color: jours(date, a.peremption) <= ALERTE_PEREMPTION ? C.red : C.gris }}>
                  Périme le {a.peremption}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 12, color: C.gris, marginBottom: 3 }}>Prix / {a.unite}</div>
                    <input type="number" defaultValue={a.prix} onBlur={(e) => majArticle(a.id, "prix", e.target.value)}
                      style={{ width: "100%", padding: 9, fontSize: 15, borderRadius: 4, border: `2px solid ${C.line}` }} /></div>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 12, color: C.gris, marginBottom: 3 }}>Seuil d'alerte</div>
                    <input type="number" defaultValue={a.seuil} onBlur={(e) => majArticle(a.id, "seuil", e.target.value)}
                      style={{ width: "100%", padding: 9, fontSize: 15, borderRadius: 4, border: `2px solid ${C.line}` }} /></div>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 12, color: C.gris, marginBottom: 3 }}>Correction d'inventaire</div>
                    <input type="number" defaultValue={a.stock} onBlur={(e) => majArticle(a.id, "stock", e.target.value)}
                      style={{ width: "100%", padding: 9, fontSize: 15, borderRadius: 4, border: `2px solid ${C.line}` }} /></div>
                </div>
              </Card>)}
            </div>;
          })}

          <Titre>SORTIE MANUELLE</Titre>
          <Label>Article</Label>
          <Select value={so.id} onChange={(v) => setSo({ ...so, id: v })} options={optArticles("")} placeholder="Choisir" />
          <Label>Quantité sortie{so.id ? ` (${(art(so.id) || {}).unite})` : ""}</Label>
          <Compteur value={so.qte} onChange={(v) => setSo({ ...so, qte: v })} pas={0.5} />
          <Label>Destination</Label>
          <Select value={so.zone} onChange={(v) => setSo({ ...so, zone: v })}
            options={[...ZONES.TOM, ...ZONES.BAN, ...ZONES.AVI, ...HORS_CULTURE]} placeholder="Choisir" />
          <Label>Motif de la sortie</Label>
          <Select value={so.motif} onChange={(v) => setSo({ ...so, motif: v })}
            options={["Consommation directe", "Perte / casse", "Périmé — destruction", "Vol constaté",
              "Prêt / transfert", "Retour fournisseur", "Autre"]} placeholder="Choisir" />
          {so.id && so.zone && <div style={{ marginTop: -4, marginBottom: 14, fontSize: 14, color: C.gris }}>
            Imputé au centre <b>{centreAuto(so.zone)}</b> — {nomCentre(centreAuto(so.zone))}</div>}
          <Bouton onClick={sortieManuelle}>Enregistrer la sortie</Bouton>

          <Titre>COMPTAGE PHYSIQUE</Titre>
          <Note>Comptez d'abord, regardez le stock théorique ensuite. L'écart est enregistré comme
            mouvement et remonte dans les problèmes du jour s'il dépasse 20 {DEVISE}.</Note>
          <Label>Article compté</Label>
          <Select value={co.id} onChange={(v) => setCo({ ...co, id: v })} options={optArticles("")} placeholder="Choisir" />
          <Label>Quantité réellement comptée{co.id ? ` (${(art(co.id) || {}).unite})` : ""}</Label>
          <Compteur value={co.compte} onChange={(v) => setCo({ ...co, compte: v })} pas={0.5} />
          {co.id && co.compte !== "" && (() => {
            const a = art(co.id), e = Math.round((num(co.compte) - a.stock) * 1000) / 1000;
            return <div style={{ marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 4,
              background: e === 0 ? "#fff" : C.red, color: e === 0 ? C.ink : "#fff",
              border: `1px solid ${C.line}`, fontSize: 15, fontWeight: 700 }}>
              Théorique {a.stock} {a.unite} · écart {e > 0 ? "+" : ""}{e} {a.unite}
              {e !== 0 ? ` · ${usd(Math.abs(e * a.prix))} ${DEVISE}` : " · conforme"}</div>;
          })()}
          <Bouton onClick={comptagePhysique}>Enregistrer le comptage</Bouton>

          {estDirection(agent) && (<>
            <Titre>CRÉER UN ARTICLE</Titre>
            <Note tone={C.gris}>Réservé à la Direction. Les autres agents passent par une demande
              de type « Création d'un nouvel article ».</Note>
            <Label>Nom de l'article</Label>
            <TextIn value={na.nom} onChange={(v) => setNa({ ...na, nom: v })}
              placeholder="Nom commercial complet, avec la matière active ou la composition" />
            <Label>Catégorie</Label>
            <Select value={na.cat} onChange={(v) => setNa({ ...na, cat: v })} options={CAT_ARTICLES} placeholder="Choisir" />
            <Label>Unité de gestion</Label>
            <Select value={na.unite} onChange={(v) => setNa({ ...na, unite: v })}
              options={["kg", "L", "sac", "unité", "dose", "rouleau", "m", "pcs"]} placeholder="Choisir" />
            <Label>Seuil d'alerte</Label>
            <Compteur value={na.seuil} onChange={(v) => setNa({ ...na, seuil: v })} />
            <Label>Prix unitaire ({DEVISE})</Label>
            <TextIn value={na.prix} onChange={(v) => setNa({ ...na, prix: v })} type="number" placeholder="0.00" />
            <Bouton onClick={creerArticle}>Créer l'article</Bouton>
          </>)}

          <Titre>DERNIERS MOUVEMENTS</Titre>
          {!mouvements.length && <div style={{ fontSize: 15, color: C.gris }}>Aucun mouvement enregistré.</div>}
          {mouvements.slice(0, 40).map((m, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4,
              padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{m.nom}</div>
                <div style={{ fontFamily: OSW, fontSize: 16, fontWeight: 700,
                  color: m.type === "Entrée" ? C.green2 : C.laterite, whiteSpace: "nowrap" }}>
                  {m.type === "Entrée" ? "+" : "−"}{m.qte} {m.unite}</div>
              </div>
              <div style={{ fontSize: 13, marginTop: 2, color: C.gris }}>{m.t} · {m.motif}
                {m.zone ? ` · ${m.zone}` : ""} · {m.agent}</div>
            </div>))}
        </>)}

        {/* ═════ COÛTS ET RENDEMENTS ═════ */}
        {sousPage === "couts" && (<>
          <Note>Les chiffres se cumulent depuis l'installation de la culture et repartent à zéro à la
            clôture du cycle. Ils ne valent que si les prix du stock sont renseignés.</Note>
          {Object.keys(cultures).length === 0 && <div style={{ fontSize: 15, color: C.gris }}>Aucune culture en place.</div>}
          {Object.keys(cultures).map((z) => {
            const c = cultures[z], b = bilanZone(z), u = CULTURES[c.type].uniteCible;
            return <div key={z} style={{ marginBottom: 18 }}>
              <div style={{ background: CULTURES[c.type].milieu === "TOM" ? C.green
                : CULTURES[c.type].milieu === "AVI" ? C.avi : C.ban, color: "#fff",
                padding: "12px 14px", borderRadius: "4px 4px 0 0" }}>
                <div style={{ fontFamily: OSW, fontSize: 18, fontWeight: 700 }}>{z}</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{c.type} · J+{jours(c.debut, date)}
                  {b.eff ? ` · ${b.eff} ${b.avi ? "sujets" : "plants"}` : " · effectif non renseigné"}</div>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: "none",
                borderRadius: "0 0 4px 4px", padding: 14 }}>
                {(b.avi ? [["Effectif actuel", `${b.eff} sujets`],
                  ["Mis en place (estimé)", `${b.misEnPlace} sujets`],
                  ["Mortalité cumulée", `${b.morts} sujets (${b.tauxMortalite} %)`],
                  ["Aliment consommé", `${b.aliment} kg`],
                  ["Œufs produits", `${b.oeufs} propres · ${b.oeufsPerdus} perdus (${b.casseOeufs} %)`],
                  ["Poids vif sorti", `${b.kg} kg (${b.sujets} sujets)`],
                  ["Indice de consommation", b.kg ? `${b.indiceConso} kg d'aliment par kg vif` : "—"],
                  ["Coût intrants", `${usd(b.coutIntrant)} ${DEVISE}`],
                  ["Coût main-d'œuvre", `${usd(b.coutMO)} ${DEVISE} (${b.heures} h)`],
                  ["Coût total", `${usd(b.total)} ${DEVISE}`],
                  ["Coût par œuf", b.oeufs ? `${usd(b.coutOeuf)} ${DEVISE}` : "—"],
                  ["Coût par kg vif", b.kg ? `${usd(b.coutKg)} ${DEVISE}` : "—"]]
                : [["Récolté", `${b.kg} kg`], ["Écarté au tri", `${b.ecart} kg (${b.perte} %)`],
                  ["Rendement", b.eff ? `${Math.round(b.rdt * 100) / 100} ${u}` : "—"],
                  ["Cible", b.cible ? `${b.cible} ${u}` : "—"],
                  ["Coût intrants", `${usd(b.coutIntrant)} ${DEVISE}`],
                  ["Coût main-d'œuvre", `${usd(b.coutMO)} ${DEVISE} (${b.heures} h)`],
                  ["Coût total", `${usd(b.total)} ${DEVISE}`],
                  ["Coût de revient", b.kg ? `${usd(b.coutKg)} ${DEVISE} / kg` : "—"]]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0",
                    borderBottom: `1px solid ${C.line}`, fontSize: 15 }}>
                    <div style={{ color: C.gris }}>{k}</div><div style={{ fontWeight: 700 }}>{v}</div>
                  </div>))}
                {b.cible > 0 && b.eff > 0 && (<>
                  <div style={{ marginTop: 12, height: 26, background: C.line, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, b.pctCible)}%`, height: "100%",
                      background: b.pctCible >= 80 ? C.green2 : b.pctCible >= 50 ? C.amber : C.red }} />
                  </div>
                  <div style={{ fontSize: 14, marginTop: 6, fontWeight: 700,
                    color: b.pctCible >= 80 ? C.green2 : b.pctCible >= 50 ? C.amber : C.red }}>
                    {b.pctCible} % de la cible atteinte</div>
                </>)}
                {!b.eff && <Note tone={C.amber}>L'effectif n'est pas renseigné pour cette zone :
                  sans lui, pas de rendement possible. Corrigez dans Registres → Cultures.</Note>}
              </div>
            </div>;
          })}
        </>)}

        {sousPage === "couts" && (<>
          <Titre>RÉPARTITION PAR CENTRE DE COÛTS</Titre>
          {CENTRES.map((cc) => {
            const zs = Object.keys(cultures).filter((z) => centreAuto(z) === cc.code);
            const ci = zs.reduce((s, z) => s + (cumul[z] || {}).coutIntrant || 0, 0);
            const cm = zs.reduce((s, z) => s + (cumul[z] || {}).coutMO || 0, 0);
            const caisse = demandes.filter((d) => d.centre === cc.code
              && (d.statut === "Validée" || d.statut === "Servie" || d.statut === "Clôturée"))
              .reduce((s, d) => s + montantDemande(d), 0);
            const tot = ci + cm + caisse;
            if (!tot) return null;
            return <Card key={cc.code} tone={cc.bureau === "TOM" ? C.green : cc.bureau === "BAN" ? C.ban
              : cc.bureau === "AVI" ? C.avi : cc.bureau === "LIV" ? C.liv : C.gris}>
              <div style={{ fontFamily: OSW, fontSize: 16.5, fontWeight: 700 }}>{cc.code} — {cc.nom}</div>
              <div style={{ fontSize: 14.5, marginTop: 4 }}>Intrants {usd(ci)} · Main-d'œuvre {usd(cm)}
                {caisse ? ` · Demandes engagées ${usd(caisse)}` : ""}</div>
              <div style={{ fontFamily: OSW, fontSize: 22, fontWeight: 700, color: C.laterite, marginTop: 4 }}>
                {usd(tot)} {DEVISE}</div>
            </Card>;
          })}

        </>)}

        {/* ═════ LOTS ═════ */}
        {sousPage === "lots" && (<>
          <Note>Chaque récolte crée un lot. Le lot porte la parcelle, l'âge de la culture, les
            traitements des 60 jours précédents et les livraisons auxquelles il a servi. C'est la
            pièce à produire si Top Market ou un auditeur demande l'origine d'une caisse.</Note>
          <Stat libelle="Lots en stock" valeur={`${lotsDispo.reduce((s, l) => s + l.restant, 0)} kg`}
            sous={`${lotsDispo.length} lot(s) non entièrement livré(s)`} couleur={ACC} />
          {!lots.length && <div style={{ fontSize: 15, color: C.gris }}>Aucun lot créé.</div>}
          {lots.slice(0, 30).map((l) => (
            <Card key={l.id} tone={l.restant > 0 ? C.green2 : C.gris}>
              <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>{l.id}</div>
              <div style={{ fontSize: 15, marginTop: 3 }}>{l.zone} · {l.culture}
                {l.jat !== null ? ` · J+${l.jat}` : ""} · {l.date}</div>
              <div style={{ fontSize: 15, marginTop: 3 }}>
                <b style={{ color: C.laterite }}>{l.kg} kg</b> récoltés · {l.restant} kg restants
                {l.ecart ? ` · ${l.ecart} kg écartés` : ""}</div>
              <div style={{ fontSize: 14, marginTop: 4, color: C.gris }}>
                {l.traitements.length} traitement(s) sur 60 jours · {l.sorties.length} livraison(s)</div>
              {(l.photos || []).length > 0 && <div style={{ marginTop: 8 }}><Photos ids={l.photos} images={images} /></div>}
              <Bouton petit tone="ghost" onClick={() => copier(ficheLot(l))}>Copier la fiche de traçabilité</Bouton>
            </Card>))}
        </>)}

        {/* ═════ RÉGIMES ═════ */}
        {sousPage === "regimes" && (<>
          <Note>Chaque gainage crée une cohorte identifiée par le <b>ruban de la semaine</b>. La date
            de coupe se calcule automatiquement. C'est ce qui permet de promettre des volumes fermes
            à Top Market au lieu de livrer ce qui se présente.</Note>
          <Stat libelle="Régimes sur pied" valeur={regimesSurPied}
            sous={`environ ${regimes.reduce((s, r) => s + (r.nb - r.coupes) * r.poids, 0)} kg à venir`} couleur={C.ban} />
          {regimesRetard.length > 0 && <Alerte>
            {regimesRetard.reduce((s, r) => s + (r.nb - r.coupes), 0)} régime(s) ont dépassé leur date de
            coupe. Au-delà, les doigts éclatent et le lot est déclassé.</Alerte>}
          <Titre>PRÉVISIONNEL DE COUPE</Titre>
          {!regimes.length && <div style={{ fontSize: 15, color: C.gris }}>Aucune cohorte enregistrée.
            Les cohortes se créent automatiquement à chaque gainage.</div>}
          {[...regimes].filter((r) => r.coupes < r.nb).sort((a, b) => a.prevision.localeCompare(b.prevision)).map((r) => {
            const restant = r.nb - r.coupes, dj = jours(date, r.prevision);
            const tone = dj < -7 ? C.red : dj <= 7 ? C.laterite : C.green2;
            return <Card key={r.id} tone={tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>{r.parc} — ruban {r.ruban}</div>
                <div style={{ fontFamily: OSW, fontSize: 20, fontWeight: 700, color: tone }}>{restant}</div>
              </div>
              <div style={{ fontSize: 14.5, marginTop: 3 }}>Gainés le {r.date} · coupe prévue le {r.prevision}
                {dj < 0 ? ` (dépassé de ${-dj} j)` : dj === 0 ? " (aujourd'hui)" : ` (dans ${dj} j)`}</div>
              <div style={{ fontSize: 14.5, marginTop: 2 }}>Volume estimé :
                <b style={{ color: C.laterite }}> {restant * r.poids} kg</b> à {r.poids} kg par régime</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <input type="number" inputMode="numeric" value={coupe[r.id] || ""} placeholder="Coupés"
                  onChange={(e) => setCoupe({ ...coupe, [r.id]: e.target.value })}
                  style={{ flex: 1, padding: 12, fontSize: 17, textAlign: "center", borderRadius: 4,
                    border: `2px solid ${C.line}`, fontFamily: OSW, fontWeight: 700 }} />
                <button onClick={() => marquerCoupe(r.id)}
                  style={{ flex: 1, padding: 13, background: C.laterite, color: "#fff", border: "none",
                    borderRadius: 4, fontFamily: OSW, fontSize: 15, fontWeight: 700, letterSpacing: 0.6,
                    cursor: "pointer" }}>MARQUER COUPÉS</button>
              </div>
            </Card>;
          })}
          {regimes.some((r) => r.coupes >= r.nb) && (<>
            <Titre>COHORTES TERMINÉES</Titre>
            {regimes.filter((r) => r.coupes >= r.nb).slice(0, 10).map((r) => <Card key={r.id} tone={C.gris}>
              <div style={{ fontSize: 15 }}><b>{r.parc}</b> — ruban {r.ruban} — {r.nb} régime(s)</div>
              <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>Gainés le {r.date} · tous coupés</div>
            </Card>)}
          </>)}
        </>)}

        {/* ═════ HISTORIQUE DES MESURES ═════ */}
        {sousPage === "mesuresH" && (<>
          <Note>Les 500 dernières mesures, toutes sections confondues. Les valeurs hors norme sont en rouge.</Note>
          {!mesuresH.length && <div style={{ fontSize: 15, color: C.gris }}>Aucune mesure enregistrée.</div>}
          {mesuresH.slice(0, 100).map((m, i) => {
            const hn = mesureHorsNorme(m);
            return <div key={i} style={{ background: "#fff", border: `1px solid ${C.line}`,
              borderLeft: `5px solid ${hn ? C.red : C.green2}`, borderRadius: 4, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{m.nom}</div>
                <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700, color: hn ? C.red : C.laterite }}>
                  {m.valeur} {m.unite}</div>
              </div>
              <div style={{ fontSize: 13, marginTop: 2, color: C.gris }}>{m.date} · {m.zone || m.bureau} · {m.par}</div>
            </div>;
          })}
        </>)}

        {/* ═════ JOURNAL ═════ */}
        {sousPage === "journal" && (<>
          <Note>Chaque saisie, chaque tâche cochée et chaque connexion, avec le nom de l'agent et
            l'heure. Le journal ne se modifie pas.</Note>
          {!journal.length && <div style={{ fontSize: 15, color: C.gris }}>Journal vide.</div>}
          {journal.slice(0, 150).map((e, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4,
              padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: OSW, fontSize: 15, fontWeight: 600 }}>{e.action}</div>
                <div style={{ fontSize: 12.5, color: C.gris, whiteSpace: "nowrap" }}>{e.t}</div>
              </div>
              {e.detail && <div style={{ fontSize: 14, marginTop: 2 }}>{e.detail}</div>}
              <div style={{ fontSize: 13, marginTop: 2, color: C.gris }}>{e.agent}
                {e.bureau !== "—" ? ` · ${e.bureau}` : ""}</div>
            </div>))}
        </>)}

        {/* ═════ RAPPORTS ENREGISTRÉS ═════ */}
        {sousPage === "histo" && (<>
          <Label>Journées enregistrées — {NOM_BUREAU}</Label>
          <Bouton tone="ghost" onClick={chargerHisto}>Actualiser la liste</Bouton>
          {!histo.length && <div style={{ fontSize: 15, color: C.gris, padding: 12 }}>
            Aucune journée enregistrée pour cette section.</div>}
          {histo.map((h) => (
            <Card key={h.cle} tone={h.pb > 0 ? C.red : C.green2}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: OSW, fontSize: 18, fontWeight: 700 }}>{h.date}</div>
                  <div style={{ fontSize: 14, marginTop: 2 }}>{h.n} saisie(s)
                    {h.tf ? ` · ${h.tf} tâche(s)` : ""}{h.kg ? ` · ${h.kg} kg` : ""}
                    {h.pb > 0 ? ` · ${h.pb} problème(s)` : ""}</div>
                </div>
                <button onClick={() => { setDate(h.date); setOnglet("rapport"); setSousPage(""); }}
                  style={{ padding: "12px 16px", background: C.laterite, color: "#fff", border: "none",
                    borderRadius: 4, fontFamily: OSW, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    whiteSpace: "nowrap" }}>Ouvrir</button>
              </div>
            </Card>))}
        </>)}



        {sousPage === "donnees" && (<>
          <Alerte tone="amber">Le carnet vit dans le navigateur de cet appareil. Il survit aux mises à
            jour de l'application <b>tant que c'est la même application qui est modifiée</b>. Si une
            application entièrement neuve est mise en service, elle démarre avec un carnet vide :
            il faut alors restaurer une sauvegarde.</Alerte>
          <Note tone={C.green2}>
            <b>La règle, en trois gestes.</b><br />
            1. Avant tout changement de version, faites une sauvegarde intégrale et envoyez-la-vous par e-mail.<br />
            2. Ouvrez la nouvelle version.<br />
            3. Collez la sauvegarde ici en mode « Fusionner » : rien de ce qui existe n'est écrasé,
            tout ce qui manque est rétabli.
          </Note>

          {meta && <Card tone={C.laterite}>
            <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>ÉTAT DU CARNET</div>
            <div style={{ fontSize: 14.5, marginTop: 4 }}>Première utilisation : {meta.premiere}</div>
            <div style={{ fontSize: 14.5, marginTop: 2 }}>Schéma de données : version {meta.schema}</div>
            {meta.restaureLe && <div style={{ fontSize: 14.5, marginTop: 2 }}>
              Restauré le {meta.restaureLe} depuis une sauvegarde v{meta.restaureDepuis}</div>}
            <div style={{ fontSize: 13.5, marginTop: 8, color: C.gris }}>Versions utilisées sur cet appareil :</div>
            {(meta.versions || []).map((v) => <div key={v.version} style={{ fontSize: 14, marginTop: 2 }}>
              v{v.version} — depuis le {v.depuis}</div>)}
          </Card>}

          <Bouton tone="ghost" onClick={inventorier}>Compter ce que contient le carnet</Bouton>
          {inventaireCles && <Card tone={ACC}>
            <div style={{ fontFamily: OSW, fontSize: 26, fontWeight: 700 }}>{inventaireCles.total} clé(s)</div>
            <div style={{ fontSize: 14.5, marginTop: 4 }}>
              {inventaireCles.journees} journée(s) de carnet · {inventaireCles.archives} archive(s) mensuelle(s)
              · {inventaireCles.registres} registre(s) · {inventaireCles.photos} photo(s)</div>
          </Card>}

          <Titre couleur={ACC}>SAUVEGARDE INTÉGRALE</Titre>
          <Note>Un fichier .json contenant tout : journées, registres, archives, réglages. C'est le
            seul format qui permet de repartir à l'identique sur une nouvelle application.</Note>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[[false, "Sans les photos — léger"], [true, "Avec les photos — lourd"]].map(([v, lib]) => (
              <button key={String(v)} onClick={() => setAvecPhotos(v)}
                style={{ flex: 1, padding: 13, borderRadius: 4, fontSize: 13.5, fontWeight: 700,
                  fontFamily: OSW, cursor: "pointer",
                  border: avecPhotos === v ? `2px solid ${C.green}` : `1px solid ${C.line}`,
                  background: avecPhotos === v ? C.green : "#fff", color: avecPhotos === v ? "#fff" : C.ink }}>{lib}</button>))}
          </div>
          <Bouton tone="danger" onClick={sauvegardeIntegrale}>Sauvegarder tout le carnet</Bouton>
          {csv && csv.indexOf('"format":"CARNET-DTOMATE"') >= 0 && (<>
            <Bouton tone="ghost" onClick={() => copier(csv)}>Copier la sauvegarde</Bouton>
            <Bouton tone="mail" onClick={() => envoyerMail(emailDe("Christophe LOSEMBE — Direction"), "",
              `Sauvegarde Carnet de ferme v${APP_VERSION} — ${auj()}`,
              `Sauvegarde intégrale du carnet.\n\nÀ conserver. Pour la restaurer : Registres → Données et sauvegarde → coller le texte ci-dessous.\n\n${csv.slice(0, 1500)}…\n\n[Texte tronqué dans l'aperçu — joindre le fichier .json téléchargé.]`,
              "Sauvegarde")}>Envoyer la sauvegarde par e-mail</Bouton>
            <div style={{ fontSize: 13.5, color: C.gris, marginBottom: 14, lineHeight: 1.5 }}>
              Une sauvegarde complète dépasse souvent la taille d'un corps d'e-mail : joignez plutôt
              le fichier .json téléchargé.</div>
          </>)}

          <Titre couleur={ACC}>RESTAURER UNE SAUVEGARDE</Titre>
          {!estDirection(agent) ? <Note tone={C.gris}>La restauration est réservée à la Direction.</Note> : (<>
            <Note tone={C.red}>« Fusionner » ne détruit rien : les données présentes sont conservées,
              seules les manquantes sont rétablies. « Remplacer » écrase le carnet actuel par la
              sauvegarde — à n'utiliser que sur une application neuve ou après un incident.</Note>
            <Label>Mode de restauration</Label>
            <Select value={modeRestauration} onChange={setModeRestauration}
              options={["Fusionner — rien n'est écrasé", "Remplacer — la sauvegarde fait foi"]}
              placeholder="Choisir" />
            <Label>Collez ici le contenu du fichier de sauvegarde</Label>
            <TextIn value={jsonColle} onChange={setJsonColle} lines={6}
              placeholder='{"format":"CARNET-DTOMATE", …}' />
            {jsonColle && (() => {
              try {
                const q = JSON.parse(jsonColle);
                if (q.format !== "CARNET-DTOMATE") return <Alerte>Ce texte n'est pas une sauvegarde du carnet.</Alerte>;
                return <Note tone={C.green2}>Sauvegarde reconnue : version {q.version}, schéma {q.schema},
                  {" "}{Object.keys(q.donnees || {}).length} clé(s), exportée le {q.exporteLe} par {q.exportePar}.</Note>;
              } catch { return <Note tone={C.amber}>Texte incomplet ou mal collé — la sauvegarde doit
                être collée entièrement, du premier au dernier caractère.</Note>; }
            })()}
            <Bouton onClick={restaurer}>Lancer la restauration</Bouton>
          </>)}
        </>)}

        {sousPage === "alertes" && (<>
          <Note>Ces chiffres sont recalculés à chaque ouverture de la page, à partir du stock réel.
            Un article qui n'a jamais reçu d'entrée ni de prix n'apparaît pas : le catalogue n'est pas
            un inventaire.</Note>
          <Stat libelle="Alertes actives" valeur={alertesStock}
            sous={`${articlesActifs.length} article(s) suivi(s) · ${nonReferences.length} jamais approvisionné(s)`}
            couleur={alertesStock ? C.red : C.green2} />
          {!alertesStock && <Note tone={C.green2}>Aucune alerte de stock. Tout ce qui est suivi est
            au-dessus de son seuil et rien ne périme dans les {ALERTE_PEREMPTION} prochains jours.</Note>}
          {rupture.length > 0 && (<>
            <Titre couleur={C.red}>RUPTURES</Titre>
            {rupture.map((a) => <Card key={a.id} tone={C.red}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.nom}</div>
              <div style={{ fontSize: 14.5, marginTop: 3 }}>Stock épuisé · seuil {a.seuil} {a.unite}
                {a.prix ? ` · réappro estimé ${usd(a.seuil * a.prix)} ${DEVISE}` : ""}</div>
              <Bouton petit tone="ghost" onClick={() => { setDe({ ...vDe, type: "Achat / réapprovisionnement",
                objet: `Réapprovisionnement ${a.nom}`, articleId: a.id, qte: a.seuil,
                montant: Math.round(a.seuil * a.prix * 100) / 100, motif: "Rupture de stock constatée." });
                setOnglet("demandes"); setSousPage(""); }}>Créer la demande de réapprovisionnement</Bouton>
            </Card>)}
          </>)}
          {sousSeuil.length > 0 && (<>
            <Titre couleur={C.amber}>SOUS LE SEUIL</Titre>
            {sousSeuil.map((a) => <Card key={a.id} tone={C.amber}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.nom}</div>
              <div style={{ fontSize: 14.5, marginTop: 3 }}>
                <b style={{ color: C.laterite }}>{a.stock} {a.unite}</b> pour un seuil de {a.seuil} {a.unite}</div>
              <Bouton petit tone="ghost" onClick={() => { setDe({ ...vDe, type: "Achat / réapprovisionnement",
                objet: `Réapprovisionnement ${a.nom}`, articleId: a.id,
                qte: Math.max(0, a.seuil - a.stock), motif: "Stock sous le seuil d'alerte." });
                setOnglet("demandes"); setSousPage(""); }}>Créer la demande</Bouton>
            </Card>)}
          </>)}
          {perimeBientot.length > 0 && (<>
            <Titre couleur={C.red}>PÉREMPTIONS PROCHES</Titre>
            {perimeBientot.map((a) => {
              const j = jours(date, a.peremption);
              return <Card key={a.id} tone={j < 0 ? C.red : C.amber}>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.nom}</div>
                <div style={{ fontSize: 14.5, marginTop: 3 }}>
                  {j < 0 ? `PÉRIMÉ depuis ${-j} jour(s)` : `Périme dans ${j} jour(s)`} — le {a.peremption}
                  {a.stock ? ` · ${a.stock} ${a.unite} concernés` : ""}</div>
                {j < 0 && <div style={{ fontSize: 14, marginTop: 4, color: C.red, fontWeight: 700 }}>
                  Ne pas utiliser. Sortir du stock avec le motif « Périmé — destruction ».</div>}
              </Card>;
            })}
          </>)}
          {sansPrix.length > 0 && (<>
            <Titre couleur={C.gris}>PRIX MANQUANTS</Titre>
            <Note tone={C.amber}>Ces articles sont en stock sans prix unitaire : tant qu'ils n'en ont
              pas, les coûts de production et la valeur du stock sont faux.</Note>
            {sansPrix.map((a) => <Card key={a.id} tone={C.gris}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.nom}</div>
              <div style={{ fontSize: 14.5, marginTop: 3 }}>{a.stock} {a.unite} valorisés à zéro</div>
            </Card>)}
          </>)}
        </>)}

        {sousPage === "controle" && (<>
          <Note>Le carnet compare en permanence ce qui a été fait à ce que le plan prévoit. Ce qui
            apparaît ici n'est pas une opinion : c'est un écart mesuré entre le calendrier et le registre.</Note>
          <Stat libelle="Écarts détectés" valeur={anomalies.length}
            sous={`${anomalies.filter((a) => a.gravite === "manquee").length} action(s) manquée(s) · ${anomalies.filter((a) => a.gravite === "retard").length} retard(s)`}
            couleur={anomalies.length ? C.red : C.green2} />
          {!anomalies.length && <Note tone={C.green2}>Aucun écart au calendrier sur cette section.
            Les zones sans culture installée ne sont pas contrôlées.</Note>}
          {zonesBureau.filter((z) => cultures[z]).map((z) => {
            const an = anomaliesZone(z);
            if (!an.length) return null;
            const c = cultures[z];
            return <div key={z} style={{ marginBottom: 14 }}>
              <div style={{ background: C.red, color: "#fff", padding: "10px 14px", borderRadius: "4px 4px 0 0" }}>
                <div style={{ fontFamily: OSW, fontSize: 17, fontWeight: 700 }}>{z} — J+{jours(c.debut, date)}</div>
                <div style={{ fontSize: 13.5 }}>{c.type} · {an.length} écart(s)</div>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: "none",
                borderRadius: "0 0 4px 4px", padding: 12 }}>
                {an.map((a, i) => <div key={i} style={{ padding: "8px 0",
                  borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ fontSize: 11.5, fontFamily: OSW, letterSpacing: 0.9, textTransform: "uppercase",
                    color: a.gravite === "manquee" ? C.red : a.gravite === "retard" ? C.amber : C.gris }}>
                    {a.gravite === "manquee" ? "Action manquée" : a.gravite === "retard" ? "Retard" : "Donnée manquante"}</div>
                  <div style={{ fontSize: 14.5, marginTop: 3, lineHeight: 1.5 }}>{a.texte}</div>
                </div>)}
              </div>
            </div>;
          })}
        </>)}


        {/* ═════ RÉFÉRENCES ET CALENDRIERS ═════ */}
        {sousPage === "references" && (<>
          <Note>Les plans validés et les calendriers d'actions, consultables sans quitter le carnet.
            Choisissez une spéculation : seul son contenu s'affiche.</Note>
          <Label>Spéculation</Label>
          <Select value={refCulture} onChange={(v) => { setRefCulture(v); setRefPhase(-1); }}
            options={Object.keys(PLAN_REF)} placeholder="Choisir" />
          {refCulture && PLAN_REF[refCulture] && (() => {
            const P = PLAN_REF[refCulture];
            const zonesCulture = Object.keys(cultures).filter((z) => cultures[z].type === refCulture);
            const jCourant = zonesCulture.length ? jours(cultures[zonesCulture[0]].debut, date) : null;
            return <>
              <div style={{ background: ACC, color: "#fff", padding: 14, borderRadius: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, letterSpacing: 1.3, fontFamily: OSW }}>DOCUMENT DE RÉFÉRENCE</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: OSW, lineHeight: 1.25, marginTop: 2 }}>{P.doc}</div>
              </div>
              <Note tone={C.green2}>{P.base}</Note>
              {zonesCulture.length > 0 && <Note tone={C.laterite}>
                En place : {zonesCulture.join(", ")} — <b>J+{jCourant}</b>, phase « {phaseDe(refCulture, jCourant)} ».</Note>}
              <Titre couleur={ACC}>PHASES DU PLAN</Titre>
              {P.phases.map((ph, i) => {
                const active = jCourant !== null && jCourant >= ph.min && jCourant <= ph.max;
                const ouvert = refPhase === i || (refPhase === -1 && active);
                return <div key={i} style={{ marginBottom: 8 }}>
                  <button onClick={() => setRefPhase(ouvert ? -2 : i)}
                    style={{ width: "100%", textAlign: "left", background: active ? ACC : "#fff",
                      color: active ? "#fff" : C.ink, border: `1px solid ${C.line}`,
                      borderLeft: `5px solid ${active ? C.laterite : C.line}`,
                      borderRadius: 4, padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontFamily: OSW, fontSize: 16, fontWeight: 700 }}>{ph.titre}</div>
                      <div style={{ fontSize: 18, fontFamily: OSW }}>{ouvert ? "−" : "+"}</div>
                    </div>
                    {active && <div style={{ fontSize: 13, marginTop: 2 }}>Phase en cours</div>}
                  </button>
                  {ouvert && <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: "none",
                    borderRadius: "0 0 4px 4px", padding: 14, fontSize: 14.5, lineHeight: 1.6 }}>{ph.texte}</div>}
                </div>;
              })}
              <Titre couleur={ACC}>CALENDRIER DES TÂCHES</Titre>
              {CULTURES[refCulture] && ["Alimentation", "Fertigation", "Fertilisation", "Irrigation", "Conduite",
                "Phyto", "Santé", "Production", "Ambiance", "Surveillance", "Contrôle", "Récolte",
                "Entretien", "Biosécurité"].map((cat) => {
                const l = CULTURES[refCulture].taches.filter((t) => t.cat === cat);
                if (!l.length) return null;
                return <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: OSW, fontSize: 14, fontWeight: 700, color: ACC,
                    letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 6 }}>{cat}</div>
                  {l.map((t) => <div key={t.id} style={{ background: "#fff", border: `1px solid ${C.line}`,
                    borderRadius: 4, padding: "10px 12px", marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{t.nom}</div>
                    <div style={{ fontSize: 13, marginTop: 2, color: C.gris }}>
                      {t.freq === "jour" ? "chaque jour" : t.freq === "sem" ? `chaque ${JOURS_FR[t.jour]}`
                        : t.freq === "periode" ? `tous les ${t.periode} jours` : "une seule fois"}
                      {t.min !== undefined || t.max !== undefined
                        ? ` · de J+${t.min || 0} à ${t.max === undefined ? "la fin du cycle" : "J+" + t.max}` : " · tout le cycle"}</div>
                    <div style={{ fontSize: 14, marginTop: 5, lineHeight: 1.5 }}>{t.detail}</div>
                  </div>)}
                </div>;
              })}
            </>;
          })()}
        </>)}

        {/* ═════ EXPORT ═════ */}
        {sousPage === "export" && (<>
          <Note>Fichiers .csv, séparateur point-virgule, encodage UTF-8 — Excel les ouvre directement.
            Si le navigateur bloque le téléchargement, le texte s'affiche en bas de page et se copie
            d'un bouton : collez-le dans un fichier .csv ou directement dans une feuille.</Note>

          <Titre couleur={ACC}>EXPORT SUR UNE PÉRIODE</Titre>
          <Note tone={C.green2}>C'est l'export à utiliser pour la comptabilité, un bilan de cycle ou
            une sauvegarde mensuelle : il relit toutes les journées enregistrées entre les deux dates,
            avec le centre de coûts de chaque ligne.</Note>
          <Label>Du</Label>
          <DateIn value={perDebut} onChange={setPerDebut} />
          <Label>Au</Label>
          <DateIn value={perFin} onChange={setPerFin} />
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[[false, `Section ${NOM_BUREAU} seule`], [true, "Toutes les sections"]].map(([v, lib]) => (
              <button key={String(v)} onClick={() => setPerTout(v)}
                style={{ flex: 1, padding: 13, borderRadius: 4, fontSize: 14, fontWeight: 700,
                  fontFamily: OSW, letterSpacing: 0.5, cursor: "pointer",
                  border: perTout === v ? `2px solid ${C.green}` : `1px solid ${C.line}`,
                  background: perTout === v ? C.green : "#fff", color: perTout === v ? "#fff" : C.ink }}>{lib}</button>))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[["7 derniers jours", 6], ["30 derniers jours", 29], ["90 derniers jours", 89]].map(([lib, n]) => (
              <button key={lib} onClick={() => { setPerDebut(plusJours(date, -n)); setPerFin(date); }}
                style={{ flex: "1 1 30%", padding: 11, borderRadius: 4, fontSize: 13.5, fontWeight: 600,
                  border: `1px solid ${C.line}`, background: "#fff", color: C.ink, cursor: "pointer" }}>{lib}</button>))}
          </div>
          <Bouton onClick={exporterPeriode}>Exporter la période</Bouton>

          <Titre couleur={ACC}>SAUVEGARDE COMPLÈTE</Titre>
          <Note tone={C.amber}>Tous les registres dans un seul fichier. À faire une fois par mois et
            à conserver hors du téléphone : les données vivent dans le navigateur, un appareil perdu
            est un carnet perdu.</Note>
          <Bouton tone="danger" onClick={exporterTout}>Tout exporter maintenant</Bouton>

          <Titre couleur={ACC}>REGISTRES INDIVIDUELS</Titre>
          {[["journee", "Journée en cours", "Toutes les lignes du jour affiché"],
            ["rendements", "Rendements et coûts", "Une ligne par culture en place"],
            ["stock", "Inventaire du stock", "Articles, quantités, prix, valeur"],
            ["mouvements", "Mouvements de stock", "Entrées et sorties horodatées"],
            ["lots", "Lots et traçabilité", "Origine, traitements, destinations"],
            ["regimes", "Régimes de bananes", "Cohortes, rubans, prévisions"],
            ["mesures", "Historique des mesures", "EC, pH, températures, pluie"],
            ["demandes", "Demandes et réquisitions", "Objet, montant, centre, validation, statut"],
            ["centres", "Coûts par centre", "Répartition analytique des charges"],
            ["journal", "Journal d'activité", "Piste d'audit complète"]].map(([k, t, s]) => (
            <Card key={k} tone={ACC}>
              <div style={{ fontFamily: OSW, fontSize: 16.5, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>{s}</div>
              <Bouton petit onClick={() => exporter(k, t.replace(/\s/g, "_"))}>Exporter</Bouton>
            </Card>))}
          {csv && (<>
            <Titre>DERNIER EXPORT — {csv.split("\n").length} ligne(s)</Titre>
            <Bouton tone="ghost" onClick={() => copier(csv)}>Copier le texte</Bouton>
            <pre style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, padding: 12,
              fontSize: 12, lineHeight: 1.5, whiteSpace: "pre", fontFamily: "monospace", overflowX: "auto",
              maxHeight: 320 }}>{csv}</pre>
          </>)}
        </>)}

        {/* ═════ ACCÈS ═════ */}
        {sousPage === "acces" && (<>
          <Note tone={C.red}><b>Ce que ce contrôle fait et ne fait pas.</b> Il signe les saisies et
            permet de couper l'accès d'un agent en une manipulation. Il ne protège pas des données
            confidentielles : l'application tourne entièrement dans le navigateur. Pour une vraie
            authentification d'entreprise avec MFA sur les comptes @sadcis.co.za, il faut héberger
            cette application derrière le SSO Microsoft Entra ID.</Note>
          <Label>Code de site actuel</Label>
          <div style={{ fontFamily: OSW, fontSize: 30, fontWeight: 700, color: C.laterite, marginBottom: 14 }}>
            {codeSite}{codeSite === CODE_SITE_DEFAUT ? "  (code d'usine)" : ""}</div>
          <Label>Nouveau code de site (4 à 8 chiffres)</Label>
          <TextIn value={nouveauSite} onChange={setNouveauSite} type="tel" placeholder="••••" />
          <Bouton onClick={changerCodeSite}>Changer le code de site</Bouton>
          <div style={{ fontSize: 13.5, marginTop: -4, marginBottom: 18, color: C.gris, lineHeight: 1.5 }}>
            À changer à chaque départ d'un agent. L'ancien code cesse aussitôt de fonctionner.</div>

          <Titre>ADRESSES E-MAIL ET DÉLÉGATION D'AUTORITÉ</Titre>
          <Note>Sans adresse renseignée, les boutons d'envoi au supérieur ne fonctionnent pas.
            Le plafond est le montant qu'une personne peut engager seule : au-delà, la demande
            remonte automatiquement à la Direction.</Note>
          {AGENTS.map((a) => (
            <Card key={"org" + a} tone={estDirection(a) ? C.laterite : C.line}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a}</div>
              <div style={{ fontSize: 13.5, marginTop: 2, color: C.gris }}>
                {org(a).role}{superieurDe(a) ? ` · rend compte à ${courtNom(superieurDe(a))}` : " · sommet de la hiérarchie"}</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.gris, marginBottom: 3 }}>Adresse e-mail</div>
                <input type="email" defaultValue={emails[a] || ""}
                  onBlur={async (e) => { const n = { ...emails, [a]: e.target.value.trim() };
                    setEmails(n); await ecrire("dt:acces:emails", n); noter("E-mail mis à jour", courtNom(a)); }}
                  placeholder="prenom.nom@sadcis.co.za"
                  style={{ width: "100%", padding: 10, fontSize: 15, borderRadius: 4, border: `2px solid ${C.line}` }} />
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: C.gris, marginBottom: 3 }}>
                  Plafond d'engagement ({DEVISE}) — actuellement {usd(plafondDe(a))}</div>
                <input type="number" defaultValue={plafondDe(a)}
                  onBlur={async (e) => { const n = { ...doa, [a]: num(e.target.value) };
                    setDoa(n); await ecrire("dt:acces:doa", n); noter("Plafond modifié", `${courtNom(a)} → ${usd(e.target.value)}`); }}
                  style={{ width: "100%", padding: 10, fontSize: 15, borderRadius: 4, border: `2px solid ${C.line}` }} />
              </div>
            </Card>))}
          <Titre>CODES PERSONNELS</Titre>
          {AGENTS.map((a) => (
            <Card key={a} tone={codes[a] ? C.green2 : C.gris}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a}</div>
              <div style={{ fontSize: 14, marginTop: 2, color: C.gris }}>
                {codes[a] ? "Code personnel défini" : "Pas encore de code — il le créera à sa première entrée"}</div>
              <div style={{ fontSize: 13.5, marginTop: 2, color: C.gris }}>
                Taux journalier retenu pour les coûts : {usd(tauxDe(a))} {DEVISE}</div>
              {codes[a] && <Supprimer texte="Révoquer son code" onClick={() => revoquerAgent(a)} />}
            </Card>))}
        </>)}
      </div>

      {/* ═════ NAVIGATION BAS DE PAGE ═════ */}
      <div style={{ borderTop: `2px solid ${C.line}`, background: "#fff", padding: "12px 16px 20px" }}>
        <div style={{ maxWidth: 660, margin: "0 auto", display: "flex", gap: 8 }}>
          {sousPage ? (
            <button onClick={() => setSousPage("")}
              style={{ flex: 1, padding: 16, borderRadius: 4, border: "none", background: ACC, color: "#fff",
                fontFamily: OSW, fontSize: 15, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                cursor: "pointer" }}>◀ Retour aux registres</button>
          ) : (<>
            <button disabled={idx <= 0} onClick={() => setOnglet(ONG[idx - 1][0])}
              style={{ flex: 1, padding: 16, borderRadius: 4, border: `2px solid ${C.line}`, background: "#fff",
                color: idx <= 0 ? C.line : C.ink, fontFamily: OSW, fontSize: 15, fontWeight: 700,
                letterSpacing: 0.6, textTransform: "uppercase", cursor: idx <= 0 ? "default" : "pointer" }}>◀ Retour</button>
            <button onClick={() => { setOnglet("accueil"); setSousPage(""); }}
              style={{ flex: 1, padding: 16, borderRadius: 4, border: "none", background: ACC, color: "#fff",
                fontFamily: OSW, fontSize: 15, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                cursor: "pointer" }}>Accueil</button>
            <button disabled={idx >= ONG.length - 1} onClick={() => setOnglet(ONG[idx + 1][0])}
              style={{ flex: 1, padding: 16, borderRadius: 4, border: `2px solid ${C.line}`, background: "#fff",
                color: idx >= ONG.length - 1 ? C.line : C.ink, fontFamily: OSW, fontSize: 15, fontWeight: 700,
                letterSpacing: 0.6, textTransform: "uppercase",
                cursor: idx >= ONG.length - 1 ? "default" : "pointer" }}>Suivant ▶</button>
          </>)}
        </div>
      </div>

      {etat && <div style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 628, margin: "0 auto",
        background: C.ink, color: "#fff", padding: "14px 16px", borderRadius: 4, fontSize: 15, fontWeight: 600,
        textAlign: "center", zIndex: 20, lineHeight: 1.4 }}>{etat}</div>}
    </div>
  );

}
