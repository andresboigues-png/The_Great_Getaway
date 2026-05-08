// locales/pt.ts — Portuguese translation table.
//
// Shape MUST mirror locales/en.ts exactly (the `Translations` type
// derived there is the contract). The TypeScript compiler enforces
// this — adding a key in en.ts and forgetting it here yields a type
// error at every t() call site.
//
// Founder's market is Portugal/Brazil — Portuguese is the second
// shipped locale per ROADMAP D6. Strings here use European
// Portuguese conventions (Portugal); a future pt-BR variant could
// fork from this file once enough strings differ to justify it.

import type { Translations } from './en.js';

export const pt: Translations = {
    common: {
        save: 'Guardar',
        cancel: 'Cancelar',
        delete: 'Apagar',
        edit: 'Editar',
        close: 'Fechar',
        loading: 'A carregar…',
    },
    nav: {
        home: 'Início',
        feed: 'Feed',
        todo: 'Lista de tarefas',
        ai: 'Planear com IA',
        expenses: 'Despesas',
        insights: 'Análises',
        budgets: 'Orçamentos',
        settings: 'Definições',
        collections: 'Coleções',
        friends: 'Amigos',
        profile: 'Perfil',
        settlement: 'Acerto de contas',
        search: 'Pesquisar',
        newTrip: '+ Nova viagem',
        notifications: 'Notificações',
        markAllRead: 'Marcar todas como lidas',
    },
    login: {
        brand: 'The Great Getaway',
        subtitleNewUser: 'Planeia viagens, divide despesas e leva amigos — tudo sincronizado entre dispositivos.',
        subtitleReturning: 'Bem-vindo de volta. Inicia sessão para continuar de onde paraste.',
        ctaCardTitleNewUser: 'Cria a tua conta com o Google',
        ctaCardTitleReturning: 'Inicia sessão',
        finePrint: 'Os teus dados estão associados à tua conta Google e sincronizados no servidor; terminar sessão limpa a cópia local.',
        feature1Title: 'Viagens & dias',
        feature1Body: 'Planeia e regista cada dia da tua viagem.',
        feature2Title: 'Despesas partilhadas',
        feature2Body: 'Divide custos e acerta contas com clareza.',
        feature3Title: 'Amigos & companheiros',
        feature3Body: 'Convida pessoas para planearem contigo.',
    },
    settings: {
        title: 'Definições',
        general: 'Definições gerais',
        generalDesc: 'Configura filtros POI e aparência.',
        configure: 'Configurar →',
        appearance: 'Aparência',
        themeLight: 'Claro',
        themeDark: 'Escuro',
        themeSystem: 'Sistema',
        language: 'Idioma',
        languageDesc: 'Escolhe o idioma de apresentação.',
        languageEnglish: 'English',
        languagePortuguese: 'Português',
    },
    profile: {
        logOut: 'Terminar sessão',
        setStatus: 'Definir estado…',
        addBio: 'Adiciona uma biografia…',
        homeCurrencyLabel: 'Moeda de origem — em que verás totais e análises',
        publicTrips: 'viagens públicas',
        countries: 'países',
        friends: 'amigos',
    },
};
