import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import deTranslations from '@shopify/polaris/locales/de.json';
import enTranslations from '@shopify/polaris/locales/en.json';
import esTranslations from '@shopify/polaris/locales/es.json';
import frTranslations from '@shopify/polaris/locales/fr.json';
import trTranslations from '@shopify/polaris/locales/tr.json';
import zhCnTranslations from '@shopify/polaris/locales/zh-CN.json';

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'zh' | 'tr';

const LOCALE_STORAGE_KEY = 'sirius:locale';
const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const SUPPORTED_LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Francais' },
  { code: 'zh', label: '中文' },
  { code: 'tr', label: 'Turkce' },
];

const polarisTranslations: Record<LanguageCode, any> = {
  en: enTranslations,
  es: esTranslations,
  de: deTranslations,
  fr: frTranslations,
  zh: zhCnTranslations,
  tr: trTranslations,
};

const translations = {
  en: {
    app: {
      title: 'Sirius | Shopify AI analyst',
      description:
        'AI-supported sales analysis, anomaly detection, and operational guidance for your Shopify store.',
      redirecting: 'Redirecting...',
      forMerchants: 'Sirius for Shopify merchants',
      language: 'Language',
    },
    common: {
      privacyPolicy: 'Privacy Policy',
      termsOfService: 'Terms of Service',
      close: 'Close',
      loading: 'Loading...',
      active: 'Active',
      status: 'Status',
      tasks: 'Tasks',
      model: 'Model',
      save: 'Save',
      saving: 'Saving...',
      cancel: 'Cancel',
      send: 'Send',
      stop: 'Stop',
      back: 'Back',
      openInShopifyAdmin: 'Open in Shopify Admin',
      sidebarToggle: 'Toggle sidebar',
      newChat: 'New chat',
      history: 'History',
      noConversations: 'No saved conversations yet.',
      deleteConversation: 'Delete conversation',
      copyMessage: 'Copy message',
      copied: 'Copied',
      editMessage: 'Edit message',
      addFile: 'Add file',
      removeAttachment: 'Remove attachment',
      refreshData: 'Refresh data',
      apiKeys: 'Keys',
      settings: 'Settings',
      sync: 'Sync...',
      trialDaysLeft: '{count} days left in trial',
      providerKeys: 'Model keys',
      providerKeysDescription:
        'Connect separate provider keys for Claude 4.6, GPT-5, and Gemini 3.1.',
      apiKeyConnected: 'API key connected',
      apiKeyMissing: 'API key not connected',
      connectProvider: 'Connect {provider}',
      providerPlaceholder: '{provider} API key',
      storeLabel: 'Shopify store',
      welcomePrompt: 'Where should we start?',
      preparingAnalysis: 'Sirius is preparing your analysis...',
      modelWarning: 'Model warning',
      modelRequestFailed: 'The model request could not be completed. Please try again.',
      askAboutStore: 'How can I help you?',
      connectApiFirst: 'Connect an API key for {provider} first...',
      attachmentOnlyPrompt: 'Analyze these attachments and summarize the most important findings.',
      done: 'Done',
      pending: 'Pending',
      inProgress: 'In progress',
      start: 'Start',
      complete: 'Complete',
      dashboard: 'Dashboard',
      welcome: 'Welcome to Sirius',
      legalInstall:
        'Open this app from your Shopify Admin or install it through the Shopify App Store.',
      manualInstallBlocked:
        'Manual installation is disabled for security. The app only works through Shopify authorization.',
    },
    setup: {
      stepPlan: 'Plan selection',
      stepModel: 'Initial model connection',
      activatePlan: 'Activate the Sirius plan',
      continue: 'Continue',
      connectModel: 'Connect your first model',
      supportedModels:
        'We currently enable only Gemini 3.1 Pro, Claude 4.6, and supported GPT-5 family models.',
      apiKey: 'API key',
      finish: 'Finish and go to dashboard',
      selectModelError: 'Please select a model.',
      invalidApiKey: 'Please enter a valid API key.',
      apiKeySaveFailed: 'API key could not be saved.',
      modelSaveFailed: 'Model selection could not be saved.',
      billingFailed: 'Payment could not be started. You can retry from the dashboard.',
      recommended: 'Recommended',
      perMonth: '/mo',
    },
    plan: {
      name: 'Sirius Pro',
      description: 'Full-power AI advisor',
      features: [
        'General store analysis',
        'Sales reports',
        '9 expert AI skills',
        'Anomaly detection',
        'Root cause analysis',
        'Automatic task creation',
        'Confidence score and Sirius tone',
      ],
    },
    tasksPage: {
      title: 'Tasks',
      totalTasks: '{count} tasks',
      noTasks: 'No tasks yet. Ask Sirius to suggest tasks.',
      noTasksForFilter: 'No tasks found for this filter.',
      backToDashboard: 'Back to dashboard',
      filters: {
        all: 'All',
        pending: 'Pending',
        in_progress: 'In progress',
        done: 'Completed',
      },
    },
    install: {
      analystTagline: 'Sirius | Shopify AI analyst',
    },
    dashboard: {
      planChanged: 'Plan change completed successfully.',
      planDeclined: 'Plan change was not approved. Your current plan is unchanged.',
      billingError: 'There was a problem in the billing flow. Please try again.',
      missingSession:
        'Shopify session not found. Open Sirius from Shopify Admin to connect your API key.',
      missingSessionDirect:
        'Shopify session not found. Open this page from Sirius inside Shopify Admin instead of a direct dev tunnel URL.',
      invalidEdit: 'This message cannot be edited right now.',
      emptyMessage: 'Message cannot be empty.',
      updateFailed: 'Message could not be updated.',
      copyFailed: 'Message could not be copied.',
      saveProviderKey: 'Enter an API key for {provider}.',
      providerSaved: 'The API key required for {model} has been saved.',
      planUpdated: 'Plan info updated.',
      planStartFailed: 'Plan change could not be started.',
    },
    store: {
      sessionMissing:
        'Shopify session not found. Open Sirius from Shopify Admin to connect your API key.',
      genericFailure: 'The action could not be completed.',
      storeInfoFailed: 'Store information could not be loaded.',
      attachAtLeastOne: 'Please select at least one file.',
      tooManyAttachments: 'You can use at most 5 attachments in a message.',
      filesUploadFailed: 'Files could not be uploaded.',
      tokenMigrationFailed: 'Shopify token migration failed.',
      tokenMigrationStartFailed: 'Shopify token migration could not be started.',
      subscriptionFailed: 'Subscription could not be started.',
      genericRetry: 'An error occurred. Please try again.',
    },
  },
  es: {
    app: {
      title: 'Sirius | Analista AI para Shopify',
      description:
        'Analisis de ventas, deteccion de anomalías y orientacion operativa con IA para tu tienda Shopify.',
      redirecting: 'Redirigiendo...',
      forMerchants: 'Sirius para comercios de Shopify',
      language: 'Idioma',
    },
    common: {
      privacyPolicy: 'Politica de privacidad',
      termsOfService: 'Terminos del servicio',
      close: 'Cerrar',
      loading: 'Cargando...',
      active: 'Activo',
      status: 'Estado',
      tasks: 'Tareas',
      model: 'Modelo',
      save: 'Guardar',
      saving: 'Guardando...',
      cancel: 'Cancelar',
      send: 'Enviar',
      stop: 'Detener',
      back: 'Atras',
      openInShopifyAdmin: 'Abrir en Shopify Admin',
      sidebarToggle: 'Alternar barra lateral',
      newChat: 'Nuevo chat',
      history: 'Historial',
      noConversations: 'Aun no hay conversaciones guardadas.',
      deleteConversation: 'Eliminar conversacion',
      copyMessage: 'Copiar mensaje',
      copied: 'Copiado',
      editMessage: 'Editar mensaje',
      addFile: 'Agregar archivo',
      removeAttachment: 'Quitar archivo',
      refreshData: 'Actualizar datos',
      apiKeys: 'Claves',
      settings: 'Ajustes',
      sync: 'Sincronizando...',
      trialDaysLeft: 'Quedan {count} dias de prueba',
      providerKeys: 'Claves del modelo',
      providerKeysDescription:
        'Conecta claves separadas para Claude 4.6, GPT-5 y Gemini 3.1.',
      apiKeyConnected: 'Clave API conectada',
      apiKeyMissing: 'Clave API no conectada',
      connectProvider: 'Conectar {provider}',
      providerPlaceholder: 'Clave API de {provider}',
      storeLabel: 'Tienda Shopify',
      welcomePrompt: 'Por donde empezamos?',
      preparingAnalysis: 'Sirius esta preparando tu analisis...',
      modelWarning: 'Aviso del modelo',
      modelRequestFailed: 'No se pudo completar la solicitud del modelo. Intentalo de nuevo.',
      askAboutStore: 'Como puedo ayudarte?',
      connectApiFirst: 'Primero conecta una clave API para {provider}...',
      attachmentOnlyPrompt: 'Analiza estos archivos y resume los hallazgos mas importantes.',
      done: 'Hecho',
      pending: 'Pendiente',
      inProgress: 'En progreso',
      start: 'Iniciar',
      complete: 'Completar',
      dashboard: 'Panel',
      welcome: 'Bienvenido a Sirius',
      legalInstall:
        'Abre esta aplicacion desde Shopify Admin o instalala desde Shopify App Store.',
      manualInstallBlocked:
        'La instalacion manual esta desactivada por seguridad. La aplicacion solo funciona con autorizacion de Shopify.',
    },
    setup: {
      stepPlan: 'Seleccion del plan',
      stepModel: 'Conexion inicial del modelo',
      activatePlan: 'Activa el plan Sirius',
      continue: 'Continuar',
      connectModel: 'Conecta tu primer modelo',
      supportedModels:
        'Por ahora habilitamos Gemini 3.1 Pro, Claude 4.6 y modelos compatibles de la familia GPT-5.',
      apiKey: 'Clave API',
      finish: 'Finalizar e ir al panel',
      selectModelError: 'Selecciona un modelo.',
      invalidApiKey: 'Introduce una clave API valida.',
      apiKeySaveFailed: 'No se pudo guardar la clave API.',
      modelSaveFailed: 'No se pudo guardar la seleccion del modelo.',
      billingFailed: 'No se pudo iniciar el pago. Puedes volver a intentarlo desde el panel.',
      recommended: 'Recomendado',
      perMonth: '/mes',
    },
    plan: {
      name: 'Sirius Pro',
      description: 'Asesor AI de maxima potencia',
      features: [
        'Analisis general de la tienda',
        'Informes de ventas',
        '9 habilidades expertas de IA',
        'Deteccion de anomalías',
        'Analisis de causa raiz',
        'Creacion automatica de tareas',
        'Puntuacion de confianza y tono Sirius',
      ],
    },
    tasksPage: {
      title: 'Tareas',
      totalTasks: '{count} tareas',
      noTasks: 'Aun no hay tareas. Pidele a Sirius que sugiera tareas.',
      noTasksForFilter: 'No se encontraron tareas para este filtro.',
      backToDashboard: 'Volver al panel',
      filters: {
        all: 'Todas',
        pending: 'Pendientes',
        in_progress: 'En progreso',
        done: 'Completadas',
      },
    },
    install: {
      analystTagline: 'Sirius | Analista AI para Shopify',
    },
    dashboard: {
      planChanged: 'El cambio de plan se completo correctamente.',
      planDeclined: 'El cambio de plan no fue aprobado. Tu plan actual se mantiene.',
      billingError: 'Hubo un problema en el flujo de facturacion. Intentalo de nuevo.',
      missingSession:
        'No se encontro la sesion de Shopify. Abre Sirius desde Shopify Admin para conectar tu clave API.',
      missingSessionDirect:
        'No se encontro la sesion de Shopify. Abre esta pagina desde Sirius dentro de Shopify Admin en lugar de una URL directa de tunel de desarrollo.',
      invalidEdit: 'Este mensaje no se puede editar ahora mismo.',
      emptyMessage: 'El mensaje no puede estar vacio.',
      updateFailed: 'No se pudo actualizar el mensaje.',
      copyFailed: 'No se pudo copiar el mensaje.',
      saveProviderKey: 'Introduce una clave API para {provider}.',
      providerSaved: 'Se ha guardado la clave API necesaria para {model}.',
      planUpdated: 'La informacion del plan se actualizo.',
      planStartFailed: 'No se pudo iniciar el cambio de plan.',
    },
    store: {
      sessionMissing:
        'No se encontro la sesion de Shopify. Abre Sirius desde Shopify Admin para conectar tu clave API.',
      genericFailure: 'No se pudo completar la accion.',
      storeInfoFailed: 'No se pudo cargar la informacion de la tienda.',
      attachAtLeastOne: 'Selecciona al menos un archivo.',
      tooManyAttachments: 'Puedes usar como maximo 5 archivos por mensaje.',
      filesUploadFailed: 'No se pudieron subir los archivos.',
      tokenMigrationFailed: 'La migracion del token de Shopify fallo.',
      tokenMigrationStartFailed: 'No se pudo iniciar la migracion del token de Shopify.',
      subscriptionFailed: 'No se pudo iniciar la suscripcion.',
      genericRetry: 'Ocurrio un error. Intentalo de nuevo.',
    },
  },
  de: {
    app: {
      title: 'Sirius | Shopify KI-Analyst',
      description:
        'KI-gestutzte Umsatzanalyse, Anomalieerkennung und operative Empfehlungen fur deinen Shopify-Shop.',
      redirecting: 'Weiterleitung...',
      forMerchants: 'Sirius fur Shopify-Handler',
      language: 'Sprache',
    },
    common: {
      privacyPolicy: 'Datenschutzrichtlinie',
      termsOfService: 'Nutzungsbedingungen',
      close: 'Schliessen',
      loading: 'Ladt...',
      active: 'Aktiv',
      status: 'Status',
      tasks: 'Aufgaben',
      model: 'Modell',
      save: 'Speichern',
      saving: 'Speichert...',
      cancel: 'Abbrechen',
      send: 'Senden',
      stop: 'Stopp',
      back: 'Zuruck',
      openInShopifyAdmin: 'In Shopify Admin offnen',
      sidebarToggle: 'Seitenleiste umschalten',
      newChat: 'Neuer Chat',
      history: 'Verlauf',
      noConversations: 'Noch keine gespeicherten Unterhaltungen.',
      deleteConversation: 'Unterhaltung loschen',
      copyMessage: 'Nachricht kopieren',
      copied: 'Kopiert',
      editMessage: 'Nachricht bearbeiten',
      addFile: 'Datei hinzufugen',
      removeAttachment: 'Anhang entfernen',
      refreshData: 'Daten aktualisieren',
      apiKeys: 'Schlussel',
      settings: 'Einstellungen',
      sync: 'Synchronisiert...',
      trialDaysLeft: '{count} Tage Testphase ubrig',
      providerKeys: 'Modellschlussel',
      providerKeysDescription:
        'Verbinde separate Schlussel fur Claude 4.6, GPT-5 und Gemini 3.1.',
      apiKeyConnected: 'API-Schlussel verbunden',
      apiKeyMissing: 'API-Schlussel nicht verbunden',
      connectProvider: '{provider} verbinden',
      providerPlaceholder: '{provider} API-Schlussel',
      storeLabel: 'Shopify-Shop',
      welcomePrompt: 'Wo sollen wir anfangen?',
      preparingAnalysis: 'Sirius bereitet deine Analyse vor...',
      modelWarning: 'Modellhinweis',
      modelRequestFailed: 'Die Modellanfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
      askAboutStore: 'Wie kann ich dir helfen?',
      connectApiFirst: 'Verbinde zuerst einen API-Schlussel fur {provider}...',
      attachmentOnlyPrompt: 'Analysiere diese Anhange und fasse die wichtigsten Erkenntnisse zusammen.',
      done: 'Erledigt',
      pending: 'Offen',
      inProgress: 'In Bearbeitung',
      start: 'Starten',
      complete: 'Abschliessen',
      dashboard: 'Dashboard',
      welcome: 'Willkommen bei Sirius',
      legalInstall:
        'Offne diese App uber Shopify Admin oder installiere sie uber den Shopify App Store.',
      manualInstallBlocked:
        'Die manuelle Installation ist aus Sicherheitsgrunden deaktiviert. Die App funktioniert nur uber Shopify-Autorisierung.',
    },
    setup: {
      stepPlan: 'Planauswahl',
      stepModel: 'Erste Modellverbindung',
      activatePlan: 'Sirius-Plan aktivieren',
      continue: 'Weiter',
      connectModel: 'Verbinde dein erstes Modell',
      supportedModels:
        'Aktuell unterstutzen wir nur Gemini 3.1 Pro, Claude 4.6 und unterstutzte Modelle der GPT-5-Familie.',
      apiKey: 'API-Schlussel',
      finish: 'Fertigstellen und zum Dashboard',
      selectModelError: 'Bitte wahle ein Modell aus.',
      invalidApiKey: 'Bitte gib einen gultigen API-Schlussel ein.',
      apiKeySaveFailed: 'Der API-Schlussel konnte nicht gespeichert werden.',
      modelSaveFailed: 'Die Modellauswahl konnte nicht gespeichert werden.',
      billingFailed: 'Die Zahlung konnte nicht gestartet werden. Du kannst es im Dashboard erneut versuchen.',
      recommended: 'Empfohlen',
      perMonth: '/Monat',
    },
    plan: {
      name: 'Sirius Pro',
      description: 'Leistungsstarker KI-Berater',
      features: [
        'Allgemeine Shop-Analyse',
        'Verkaufsberichte',
        '9 KI-Expertenskills',
        'Anomalieerkennung',
        'Ursachenanalyse',
        'Automatische Aufgabenerstellung',
        'Confidence Score und Sirius-Ton',
      ],
    },
    tasksPage: {
      title: 'Aufgaben',
      totalTasks: '{count} Aufgaben',
      noTasks: 'Noch keine Aufgaben. Bitte Sirius, Aufgaben vorzuschlagen.',
      noTasksForFilter: 'Keine Aufgaben fur diesen Filter gefunden.',
      backToDashboard: 'Zuruck zum Dashboard',
      filters: {
        all: 'Alle',
        pending: 'Offen',
        in_progress: 'In Bearbeitung',
        done: 'Abgeschlossen',
      },
    },
    install: {
      analystTagline: 'Sirius | Shopify KI-Analyst',
    },
    dashboard: {
      planChanged: 'Die Plananderung wurde erfolgreich abgeschlossen.',
      planDeclined: 'Die Plananderung wurde nicht genehmigt. Dein aktueller Plan bleibt erhalten.',
      billingError: 'Im Abrechnungsablauf ist ein Problem aufgetreten. Bitte versuche es erneut.',
      missingSession:
        'Shopify-Sitzung nicht gefunden. Offne Sirius in Shopify Admin, um deinen API-Schlussel zu verbinden.',
      missingSessionDirect:
        'Shopify-Sitzung nicht gefunden. Offne diese Seite in Sirius innerhalb von Shopify Admin statt uber eine direkte Entwicklungs-Tunnel-URL.',
      invalidEdit: 'Diese Nachricht kann derzeit nicht bearbeitet werden.',
      emptyMessage: 'Die Nachricht darf nicht leer sein.',
      updateFailed: 'Die Nachricht konnte nicht aktualisiert werden.',
      copyFailed: 'Die Nachricht konnte nicht kopiert werden.',
      saveProviderKey: 'Gib einen API-Schlussel fur {provider} ein.',
      providerSaved: 'Der erforderliche API-Schlussel fur {model} wurde gespeichert.',
      planUpdated: 'Planinformationen wurden aktualisiert.',
      planStartFailed: 'Die Plananderung konnte nicht gestartet werden.',
    },
    store: {
      sessionMissing:
        'Shopify-Sitzung nicht gefunden. Offne Sirius in Shopify Admin, um deinen API-Schlussel zu verbinden.',
      genericFailure: 'Die Aktion konnte nicht abgeschlossen werden.',
      storeInfoFailed: 'Shop-Informationen konnten nicht geladen werden.',
      attachAtLeastOne: 'Bitte wahle mindestens eine Datei aus.',
      tooManyAttachments: 'Du kannst maximal 5 Anhange pro Nachricht verwenden.',
      filesUploadFailed: 'Dateien konnten nicht hochgeladen werden.',
      tokenMigrationFailed: 'Die Shopify-Token-Migration ist fehlgeschlagen.',
      tokenMigrationStartFailed: 'Die Shopify-Token-Migration konnte nicht gestartet werden.',
      subscriptionFailed: 'Das Abonnement konnte nicht gestartet werden.',
      genericRetry: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
    },
  },
  fr: {
    app: {
      title: 'Sirius | Analyste IA Shopify',
      description:
        'Analyse des ventes, detection des anomalies et accompagnement operationnel par IA pour votre boutique Shopify.',
      redirecting: 'Redirection...',
      forMerchants: 'Sirius pour les marchands Shopify',
      language: 'Langue',
    },
    common: {
      privacyPolicy: 'Politique de confidentialite',
      termsOfService: "Conditions d'utilisation",
      close: 'Fermer',
      loading: 'Chargement...',
      active: 'Actif',
      status: 'Statut',
      tasks: 'Taches',
      model: 'Modele',
      save: 'Enregistrer',
      saving: 'Enregistrement...',
      cancel: 'Annuler',
      send: 'Envoyer',
      stop: 'Arreter',
      back: 'Retour',
      openInShopifyAdmin: 'Ouvrir dans Shopify Admin',
      sidebarToggle: 'Afficher ou masquer la barre laterale',
      newChat: 'Nouveau chat',
      history: 'Historique',
      noConversations: 'Aucune conversation enregistree pour le moment.',
      deleteConversation: 'Supprimer la conversation',
      copyMessage: 'Copier le message',
      copied: 'Copie',
      editMessage: 'Modifier le message',
      addFile: 'Ajouter un fichier',
      removeAttachment: "Retirer la piece jointe",
      refreshData: 'Actualiser les donnees',
      apiKeys: 'Cles',
      settings: 'Parametres',
      sync: 'Sync...',
      trialDaysLeft: 'Il reste {count} jours d’essai',
      providerKeys: 'Cles des modeles',
      providerKeysDescription:
        'Connectez des cles distinctes pour Claude 4.6, GPT-5 et Gemini 3.1.',
      apiKeyConnected: 'Cle API connectee',
      apiKeyMissing: 'Cle API non connectee',
      connectProvider: 'Connecter {provider}',
      providerPlaceholder: 'Cle API {provider}',
      storeLabel: 'Boutique Shopify',
      welcomePrompt: 'Par ou commencer ?',
      preparingAnalysis: 'Sirius prepare votre analyse...',
      modelWarning: 'Alerte du modele',
      modelRequestFailed: 'La requete du modele n’a pas pu etre terminee. Veuillez reessayer.',
      askAboutStore: 'Comment puis-je vous aider ?',
      connectApiFirst: 'Connectez d’abord une cle API pour {provider}...',
      attachmentOnlyPrompt: 'Analyse ces fichiers et resume les informations les plus importantes.',
      done: 'Termine',
      pending: 'En attente',
      inProgress: 'En cours',
      start: 'Demarrer',
      complete: 'Terminer',
      dashboard: 'Tableau de bord',
      welcome: 'Bienvenue sur Sirius',
      legalInstall:
        'Ouvrez cette application depuis Shopify Admin ou installez-la via le Shopify App Store.',
      manualInstallBlocked:
        "L'installation manuelle est desactivee pour des raisons de securite. L'application fonctionne uniquement via l'autorisation Shopify.",
    },
    setup: {
      stepPlan: 'Choix du plan',
      stepModel: 'Connexion initiale du modele',
      activatePlan: 'Activer le plan Sirius',
      continue: 'Continuer',
      connectModel: 'Connectez votre premier modele',
      supportedModels:
        'Nous activons actuellement uniquement Gemini 3.1 Pro, Claude 4.6 et les modeles pris en charge de la famille GPT-5.',
      apiKey: 'Cle API',
      finish: 'Terminer et aller au tableau de bord',
      selectModelError: 'Veuillez selectionner un modele.',
      invalidApiKey: 'Veuillez saisir une cle API valide.',
      apiKeySaveFailed: "La cle API n'a pas pu etre enregistree.",
      modelSaveFailed: 'La selection du modele n’a pas pu etre enregistree.',
      billingFailed: 'Le paiement n’a pas pu etre lance. Vous pouvez reessayer depuis le tableau de bord.',
      recommended: 'Recommande',
      perMonth: '/mois',
    },
    plan: {
      name: 'Sirius Pro',
      description: 'Conseiller IA complet',
      features: [
        'Analyse generale de la boutique',
        'Rapports de ventes',
        '9 competences IA expertes',
        'Detection des anomalies',
        'Analyse des causes racines',
        'Creation automatique de taches',
        'Score de confiance et ton Sirius',
      ],
    },
    tasksPage: {
      title: 'Taches',
      totalTasks: '{count} taches',
      noTasks: 'Aucune tache pour le moment. Demandez a Sirius de suggerer des taches.',
      noTasksForFilter: 'Aucune tache trouvee pour ce filtre.',
      backToDashboard: 'Retour au tableau de bord',
      filters: {
        all: 'Toutes',
        pending: 'En attente',
        in_progress: 'En cours',
        done: 'Terminees',
      },
    },
    install: {
      analystTagline: 'Sirius | Analyste IA Shopify',
    },
    dashboard: {
      planChanged: 'Le changement de plan a ete effectue avec succes.',
      planDeclined: 'Le changement de plan n’a pas ete approuve. Votre plan actuel est conserve.',
      billingError: 'Un probleme est survenu dans le flux de facturation. Veuillez reessayer.',
      missingSession:
        'Session Shopify introuvable. Ouvrez Sirius depuis Shopify Admin pour connecter votre cle API.',
      missingSessionDirect:
        'Session Shopify introuvable. Ouvrez cette page depuis Sirius dans Shopify Admin au lieu d’une URL directe de tunnel de developpement.',
      invalidEdit: 'Ce message ne peut pas etre modifie pour le moment.',
      emptyMessage: 'Le message ne peut pas etre vide.',
      updateFailed: 'Le message n’a pas pu etre mis a jour.',
      copyFailed: 'Le message n’a pas pu etre copie.',
      saveProviderKey: 'Saisissez une cle API pour {provider}.',
      providerSaved: 'La cle API necessaire pour {model} a ete enregistree.',
      planUpdated: 'Les informations du plan ont ete mises a jour.',
      planStartFailed: 'Le changement de plan n’a pas pu etre demarre.',
    },
    store: {
      sessionMissing:
        'Session Shopify introuvable. Ouvrez Sirius depuis Shopify Admin pour connecter votre cle API.',
      genericFailure: "L'action n'a pas pu etre terminee.",
      storeInfoFailed: 'Les informations de la boutique n’ont pas pu etre chargees.',
      attachAtLeastOne: 'Veuillez selectionner au moins un fichier.',
      tooManyAttachments: 'Vous pouvez utiliser au maximum 5 pieces jointes par message.',
      filesUploadFailed: 'Les fichiers n’ont pas pu etre televerses.',
      tokenMigrationFailed: 'La migration du token Shopify a echoue.',
      tokenMigrationStartFailed: 'La migration du token Shopify n’a pas pu demarrer.',
      subscriptionFailed: "L'abonnement n'a pas pu etre demarre.",
      genericRetry: 'Une erreur est survenue. Veuillez reessayer.',
    },
  },
  zh: {
    app: {
      title: 'Sirius | Shopify AI 分析师',
      description: '为你的 Shopify 店铺提供 AI 销售分析、异常检测和运营建议。',
      redirecting: '正在跳转...',
      forMerchants: '面向 Shopify 商家的 Sirius',
      language: '语言',
    },
    common: {
      privacyPolicy: '隐私政策',
      termsOfService: '服务条款',
      close: '关闭',
      loading: '加载中...',
      active: '已启用',
      status: '状态',
      tasks: '任务',
      model: '模型',
      save: '保存',
      saving: '保存中...',
      cancel: '取消',
      send: '发送',
      stop: '停止',
      back: '返回',
      openInShopifyAdmin: '在 Shopify Admin 中打开',
      sidebarToggle: '切换侧边栏',
      newChat: '新对话',
      history: '历史记录',
      noConversations: '还没有已保存的对话。',
      deleteConversation: '删除对话',
      copyMessage: '复制消息',
      copied: '已复制',
      editMessage: '编辑消息',
      addFile: '添加文件',
      removeAttachment: '移除附件',
      refreshData: '刷新数据',
      apiKeys: '密钥',
      settings: '设置',
      sync: '同步中...',
      trialDaysLeft: '试用还剩 {count} 天',
      providerKeys: '模型密钥',
      providerKeysDescription: '分别连接 Claude 4.6、GPT-5 和 Gemini 3.1 的提供商密钥。',
      apiKeyConnected: 'API 密钥已连接',
      apiKeyMissing: 'API 密钥未连接',
      connectProvider: '连接 {provider}',
      providerPlaceholder: '{provider} API 密钥',
      storeLabel: 'Shopify 店铺',
      welcomePrompt: '我们从哪里开始？',
      preparingAnalysis: 'Sirius 正在准备分析...',
      modelWarning: '模型提醒',
      modelRequestFailed: '模型请求未能完成，请重试。',
      askAboutStore: '我可以如何帮助你？',
      connectApiFirst: '请先为 {provider} 连接 API 密钥...',
      attachmentOnlyPrompt: '请分析这些附件，并总结最重要的发现。',
      done: '已完成',
      pending: '待处理',
      inProgress: '进行中',
      start: '开始',
      complete: '完成',
      dashboard: '控制台',
      welcome: '欢迎使用 Sirius',
      legalInstall: '请从 Shopify Admin 打开此应用，或通过 Shopify App Store 安装。',
      manualInstallBlocked: '出于安全原因，手动安装已被禁用。应用只能通过 Shopify 授权使用。',
    },
    setup: {
      stepPlan: '计划选择',
      stepModel: '首次连接模型',
      activatePlan: '启用 Sirius 计划',
      continue: '继续',
      connectModel: '连接你的第一个模型',
      supportedModels: '当前仅支持 Gemini 3.1 Pro、Claude 4.6 和受支持的 GPT-5 系列模型。',
      apiKey: 'API 密钥',
      finish: '完成并进入控制台',
      selectModelError: '请选择一个模型。',
      invalidApiKey: '请输入有效的 API 密钥。',
      apiKeySaveFailed: 'API 密钥无法保存。',
      modelSaveFailed: '模型选择无法保存。',
      billingFailed: '无法启动付款流程。你可以在控制台中重试。',
      recommended: '推荐',
      perMonth: '/月',
    },
    plan: {
      name: 'Sirius Pro',
      description: '全功能 AI 顾问',
      features: [
        '店铺综合分析',
        '销售报告',
        '9 个专家级 AI 技能',
        '异常检测',
        '根因分析',
        '自动创建任务',
        '置信度评分和 Sirius 语气',
      ],
    },
    tasksPage: {
      title: '任务',
      totalTasks: '{count} 个任务',
      noTasks: '还没有任务。请让 Sirius 为你推荐任务。',
      noTasksForFilter: '该筛选条件下没有任务。',
      backToDashboard: '返回控制台',
      filters: {
        all: '全部',
        pending: '待处理',
        in_progress: '进行中',
        done: '已完成',
      },
    },
    install: {
      analystTagline: 'Sirius | Shopify AI 分析师',
    },
    dashboard: {
      planChanged: '计划变更已成功完成。',
      planDeclined: '计划变更未获批准。当前计划保持不变。',
      billingError: '计费流程出现问题，请重试。',
      missingSession: '未找到 Shopify 会话。请从 Shopify Admin 打开 Sirius 以连接你的 API 密钥。',
      missingSessionDirect: '未找到 Shopify 会话。请从 Shopify Admin 中的 Sirius 打开此页面，而不是直接使用开发隧道地址。',
      invalidEdit: '当前无法编辑此消息。',
      emptyMessage: '消息不能为空。',
      updateFailed: '消息无法更新。',
      copyFailed: '消息无法复制。',
      saveProviderKey: '请输入 {provider} 的 API 密钥。',
      providerSaved: '{model} 所需的 API 密钥已保存。',
      planUpdated: '计划信息已更新。',
      planStartFailed: '无法开始计划变更。',
    },
    store: {
      sessionMissing: '未找到 Shopify 会话。请从 Shopify Admin 打开 Sirius 以连接你的 API 密钥。',
      genericFailure: '操作无法完成。',
      storeInfoFailed: '无法加载店铺信息。',
      attachAtLeastOne: '请至少选择一个文件。',
      tooManyAttachments: '每条消息最多只能使用 5 个附件。',
      filesUploadFailed: '文件上传失败。',
      tokenMigrationFailed: 'Shopify 令牌迁移失败。',
      tokenMigrationStartFailed: '无法启动 Shopify 令牌迁移。',
      subscriptionFailed: '无法启动订阅。',
      genericRetry: '发生错误，请重试。',
    },
  },
  tr: {
    app: {
      title: 'Sirius | Shopify AI analisti',
      description:
        'Shopify magazaniz icin AI destekli satis analizi, anomali tespiti ve operasyonel yonlendirme.',
      redirecting: 'Yonlendiriliyorsunuz...',
      forMerchants: 'Shopify merchantlari icin Sirius',
      language: 'Dil',
    },
    common: {
      privacyPolicy: 'Gizlilik Politikasi',
      termsOfService: 'Kullanim Sartlari',
      close: 'Kapat',
      loading: 'Yukleniyor...',
      active: 'Aktif',
      status: 'Durum',
      tasks: 'Gorevler',
      model: 'Model',
      save: 'Kaydet',
      saving: 'Kaydediliyor...',
      cancel: 'Iptal',
      send: 'Gonder',
      stop: 'Durdur',
      back: 'Geri',
      openInShopifyAdmin: 'Shopify Admin icinde ac',
      sidebarToggle: 'Kenar cubugunu ac kapa',
      newChat: 'Yeni sohbet',
      history: 'Gecmis',
      noConversations: 'Henuz kayitli bir konusma yok.',
      deleteConversation: 'Konusmayi sil',
      copyMessage: 'Mesaji kopyala',
      copied: 'Kopyalandi',
      editMessage: 'Mesaji duzenle',
      addFile: 'Dosya ekle',
      removeAttachment: 'Eki kaldir',
      refreshData: 'Veri yenileme',
      apiKeys: 'Anahtarlar',
      settings: 'Ayarlar',
      sync: 'Sync...',
      trialDaysLeft: 'Trial: {count} gun kaldi',
      providerKeys: 'Model anahtarlari',
      providerKeysDescription:
        'Claude 4.6, GPT-5 ve Gemini 3.1 ailesi icin saglayici anahtarlarinizi ayri ayri baglayin.',
      apiKeyConnected: 'API anahtari bagli',
      apiKeyMissing: 'API anahtari bagli degil',
      connectProvider: '{provider} bagla',
      providerPlaceholder: '{provider} API anahtari',
      storeLabel: 'Shopify magaza',
      welcomePrompt: 'Nereden başlayalım?',
      preparingAnalysis: 'Sirius analiz hazirliyor...',
      modelWarning: 'Model Uyarisi',
      modelRequestFailed: 'Model istegi tamamlanamadi. Lutfen tekrar deneyin.',
      askAboutStore: 'Sana nasıl yardımcı olabilirim?',
      connectApiFirst: '{provider} icin once API anahtari baglayin...',
      attachmentOnlyPrompt: 'Bu ekleri analiz et ve en onemli bulgulari kisaca ozetle.',
      done: 'Tamamlandi',
      pending: 'Bekliyor',
      inProgress: 'Devam ediyor',
      start: 'Basla',
      complete: 'Tamamla',
      dashboard: 'Dashboard',
      welcome: 'Sirius’a hos geldiniz',
      legalInstall:
        'Bu uygulamayi kullanmak icin lutfen Shopify Admin panelinizden acin veya Shopify App Store uzerinden yukleyin.',
      manualInstallBlocked:
        'Manuel kurulum guvenlik nedeniyle kapatilmis durumda. Uygulama sadece Shopify uzerinden yetkilendirme ile calisir.',
    },
    setup: {
      stepPlan: 'Plan secimi',
      stepModel: 'Ilk model baglantisi',
      activatePlan: 'Sirius planini etkinlestirin',
      continue: 'Devam et',
      connectModel: 'Ilk modeli baglayin',
      supportedModels:
        'Yalnizca Gemini 3.1 Pro, Claude 4.6 ve GPT-5 ailesindeki desteklenen modelleri aciyoruz.',
      apiKey: 'API anahtari',
      finish: 'Tamamla ve dashboarda git',
      selectModelError: 'Lutfen bir model secin.',
      invalidApiKey: 'Lutfen gecerli bir API anahtari girin.',
      apiKeySaveFailed: 'API anahtari kaydedilemedi.',
      modelSaveFailed: 'Model secimi kaydedilemedi.',
      billingFailed: 'Odeme baslatilamadi. Dashboarddan tekrar deneyebilirsiniz.',
      recommended: 'Onerilen',
      perMonth: '/ay',
    },
    plan: {
      name: 'Sirius Pro',
      description: 'Tam guclu AI danisman',
      features: [
        'Genel magaza analizi',
        'Satis raporlari',
        '9 uzman AI skill',
        'Anomali tespiti',
        'Kok neden analizi',
        'Otomatik gorev uretimi',
        'Guven skoru ve Sirius tonu',
      ],
    },
    tasksPage: {
      title: 'Gorevler',
      totalTasks: '{count} gorev',
      noTasks: 'Henuz gorev yok. Siriusdan gorev onermesini isteyin.',
      noTasksForFilter: 'Bu filtrede gorev bulunamadi.',
      backToDashboard: 'Dashboarda don',
      filters: {
        all: 'Tumu',
        pending: 'Bekliyor',
        in_progress: 'Devam ediyor',
        done: 'Tamamlandi',
      },
    },
    install: {
      analystTagline: 'Sirius | Shopify AI analisti',
    },
    dashboard: {
      planChanged: 'Plan degisikligi basariyla tamamlandi.',
      planDeclined: 'Plan degisikligi onaylanmadi. Mevcut planiniz korunuyor.',
      billingError: 'Billing akisinda bir sorun olustu. Lutfen tekrar deneyin.',
      missingSession:
        'Shopify oturumu bulunamadi. API anahtari baglamak icin Sirius uygulamasini Shopify Admin icinden acin.',
      missingSessionDirect:
        'Shopify oturumu bulunamadi. Bu sayfayi dogrudan gelistirme tuneli adresinden degil, Shopify Admin icindeki Sirius uygulamasindan acin.',
      invalidEdit: 'Bu mesaj su anda duzenlenemiyor.',
      emptyMessage: 'Mesaj bos birakilamaz.',
      updateFailed: 'Mesaj guncellenemedi.',
      copyFailed: 'Mesaj kopyalanamadi.',
      saveProviderKey: '{provider} icin bir API anahtari girin.',
      providerSaved: '{model} icin gerekli API anahtari kaydedildi.',
      planUpdated: 'Plan bilgisi guncellendi.',
      planStartFailed: 'Plan degisikligi baslatilamadi.',
    },
    store: {
      sessionMissing:
        'Shopify oturumu bulunamadi. API anahtari baglamak icin Sirius uygulamasini Shopify Admin icinden acin.',
      genericFailure: 'Islem tamamlanamadi.',
      storeInfoFailed: 'Magaza bilgileri alinamadi.',
      attachAtLeastOne: 'Lutfen en az bir dosya secin.',
      tooManyAttachments: 'Bir mesajda en fazla 5 ek kullanabilirsiniz.',
      filesUploadFailed: 'Dosyalar yuklenemedi.',
      tokenMigrationFailed: 'Shopify token migration basarisiz.',
      tokenMigrationStartFailed: 'Shopify token migration baslatilamadi.',
      subscriptionFailed: 'Abonelik baslatilamadi.',
      genericRetry: 'Bir hata olustu. Lutfen tekrar deneyin.',
    },
  },
} as const;

type TranslationTree = (typeof translations)[LanguageCode];

function resolvePreferredLanguage(value?: string | null): LanguageCode {
  if (!value) {
    return DEFAULT_LANGUAGE;
  }

  const normalized = value.toLowerCase();
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('tr')) return 'tr';
  return 'en';
}

function getByPath(tree: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, segment) => current?.[segment], tree);
}

function interpolate(text: string, params?: Record<string, string | number>) {
  if (!params) {
    return text;
  }

  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    text
  );
}

export function getStoredLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  return resolvePreferredLanguage(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function getInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) {
    return resolvePreferredLanguage(stored);
  }

  return resolvePreferredLanguage(window.navigator.language);
}

export function translate(
  locale: LanguageCode,
  key: string,
  params?: Record<string, string | number>
) {
  const scoped = translations[locale] || translations[DEFAULT_LANGUAGE];
  const fallback = translations[DEFAULT_LANGUAGE];
  const value = getByPath(scoped as unknown as Record<string, any>, key) ?? getByPath(fallback as unknown as Record<string, any>, key);

  if (typeof value !== 'string') {
    return key;
  }

  return interpolate(value, params);
}

export function getCurrentLocaleMessages(locale: LanguageCode) {
  return translations[locale];
}

export function getResponseLanguageName(locale: LanguageCode) {
  return {
    en: 'English',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
    zh: 'Simplified Chinese',
    tr: 'Turkish',
  }[locale];
}

type I18nContextValue = {
  locale: LanguageCode;
  setLocale: (locale: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  polarisLocale: any;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    setLocaleState(getInitialLanguage());
  }, []);

  const setLocale = useCallback((nextLocale: LanguageCode) => {
    setLocaleState(nextLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      polarisLocale: polarisTranslations[locale],
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside LanguageProvider');
  }

  return context;
}
