// locales/fr.ts — French translation table.
//
// Shape MUST mirror locales/en.ts exactly (the `Translations` type
// derived there is the contract). The TypeScript compiler enforces
// this — adding a key in en.ts and forgetting it here yields a type
// error at every t() call site.
//
// French was added in i18n session 2 alongside the lazy-loading
// refactor. Strings here use informal "tu" form for warmth (matches
// the Spanish locale's "tú" choice — travel apps lean friendly).
// French of France conventions (fr-FR); fr-CA / fr-BE deviations
// minor enough to share a file for now.
//
// LAZY-LOADED: this file is its own Vite chunk — i18n.ts does
// `import('./locales/fr.js')` on demand from setLocale() / loadLocale.
// It does NOT ship in the entry bundle.

import type { Translations } from './en.js';

export const fr: Translations = {
    common: {
        save: 'Enregistrer',
        cancel: 'Annuler',
        delete: 'Supprimer',
        edit: 'Modifier',
        close: 'Fermer',
        loading: 'Chargement…',
        retry: 'Réessayer',
        confirm: 'Confirmer',
        ok: 'OK',
        yes: 'Oui',
        no: 'Non',
        back: 'Retour',
        next: 'Suivant',
        done: 'Terminé',
        remove: 'Retirer',
        add: 'Ajouter',
        search: 'Rechercher',
    },
    nav: {
        home: 'Accueil',
        feed: 'Fil',
        todo: 'À faire',
        ai: 'Planifier avec l\'IA',
        expenses: 'Dépenses',
        insights: 'Analyses',
        budgets: 'Budgets',
        settings: 'Paramètres',
        collections: 'Collections',
        friends: 'Amis',
        profile: 'Profil',
        settlement: 'Règlement',
        search: 'Rechercher',
        newTrip: '+ Nouveau voyage',
        notifications: 'Notifications',
        markAllRead: 'Tout marquer comme lu',
        notificationsEmpty: 'Aucune nouvelle notification',
    },
    login: {
        brand: 'The Great Getaway',
        subtitleNewUser: 'Planifie tes voyages, partage les dépenses et embarque tes amis — tout est synchronisé entre tes appareils.',
        subtitleReturning: 'Bon retour. Connecte-toi pour reprendre où tu en étais.',
        ctaCardTitleNewUser: 'Crée ton compte avec Google',
        ctaCardTitleReturning: 'Reconnecte-toi',
        finePrint: 'Tes données sont liées à ton compte Google et synchronisées sur le serveur ; te déconnecter efface la copie locale.',
        feature1Title: 'Voyages & journées',
        feature1Body: 'Planifie et raconte chaque journée de ton voyage.',
        feature2Title: 'Dépenses partagées',
        feature2Body: 'Partage les frais et règle les comptes simplement.',
        feature3Title: 'Amis & compagnons',
        feature3Body: 'Invite des proches à planifier avec toi.',
    },
    settings: {
        title: 'Paramètres',
        general: 'Paramètres généraux',
        generalDesc: 'Configure les filtres POI et l\'apparence.',
        configure: 'Configurer →',
        appearance: 'Apparence',
        themeLight: 'Clair',
        themeDark: 'Sombre',
        themeSystem: 'Système',
        language: 'Langue',
        languageDesc: 'Choisis ta langue d\'affichage préférée.',
        languageEnglish: 'English',
        languagePortuguese: 'Português',
        languageSpanish: 'Español',
        languageFrench: 'Français',
    },
    profile: {
        logOut: 'Se déconnecter',
        setStatus: 'Définir un statut…',
        addBio: 'Ajoute une bio…',
        homeCurrencyLabel: 'Devise principale — celle dans laquelle tu verras totaux et analyses',
        publicTrips: 'voyages publics',
        countries: 'pays',
        friends: 'amis',
        photoUploaded: 'Photo de profil mise à jour.',
        photoUploadFailed: 'Impossible de charger ta photo — réessaie.',
        photoSaveFailed: 'Impossible d\'enregistrer la photo (HTTP {status}).',
        photoSaveNetwork: 'Erreur réseau — impossible d\'enregistrer la photo.',
        photoSessionExpired: 'Session expirée — actualise la page.',
        updated: 'Profil mis à jour !',
        saveFailed: 'Impossible d\'enregistrer le profil (HTTP {status}). Réessaie.',
        saveNetwork: 'Erreur réseau — impossible d\'enregistrer le profil.',
    },
    home: {
        emptyHeroTitle: 'Partons en voyage.',
        emptyHeroBody: 'Ta prochaine grande aventure t\'attend. Crée un voyage pour commencer à suivre tes dépenses et planifier tes journées.',
        emptyHeroCta: 'Créer un voyage',
        greetingDefault: 'Bon retour, voyageur',
        greetingNamed: 'Bon retour, {name} !',
        greetingTripName: 'Prêt pour ton aventure {trip} ?',
        greetingCountryStart: 'Ton aventure {country} commence ici.',
        greetingCountryStory: 'Il est temps d\'écrire ton histoire {country}.',
    },
    toasts: {
        networkError: 'Erreur réseau — réessaie.',
        saveFailed: 'Impossible d\'enregistrer — réessaie.',
        loadFailed: 'Impossible de charger — réessaie.',
        sessionExpired: 'Session expirée — actualise la page.',
        actionFailed: 'Quelque chose s\'est mal passé. Réessaie.',
        saved: 'Enregistré.',
        copied: 'Copié dans le presse-papiers.',
        uploadFailed: 'Échec du téléversement — réessaie.',
        uploadTooLarge: 'Fichier trop volumineux.',
        syncFailed: 'Impossible de synchroniser. Mode hors ligne.',
    },
    validation: {
        required: 'Ce champ est obligatoire.',
        invalidValue: 'Saisis une valeur valide.',
        invalidEmail: 'Saisis un email valide.',
        invalidNumber: 'Saisis un nombre valide.',
        invalidDate: 'Saisis une date valide.',
        endBeforeStart: 'La date de fin doit être identique ou postérieure à la date de début.',
        percentagesMustSum: 'Les pourcentages doivent totaliser exactement 100 %',
        invalidExpenseValue: 'Saisis un montant de dépense valide.',
        currencyRequired: 'Sélectionne une devise.',
        selectTripFirst: 'Sélectionne ou crée d\'abord un voyage !',
        selectFile: 'Sélectionne un fichier valide à traiter.',
        missingRequiredFields: 'Champs obligatoires manquants : {fields}',
    },
    emptyState: {
        noResults: 'Aucun résultat',
        noResultsHint: 'Essaie une autre recherche.',
        noFriends: 'Pas encore d\'amis',
        noFriendsHint: 'Invite des proches à planifier des voyages avec toi.',
        noTrips: 'Pas encore de voyages',
        noExpenses: 'Pas encore de dépenses',
        noFeed: 'Rien dans ton fil pour l\'instant',
    },
};
