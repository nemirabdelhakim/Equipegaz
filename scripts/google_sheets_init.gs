/**
 * Script Google Apps Script — Initialisation du classeur central et dossier Drive
 * Projet : GESTION ÉQUIPE GAZ – SIDI ALI (Sonelgaz Distribution Mostaganem)
 * Exécuter setupDistrictGazWorkbook() depuis script.google.com ou Extensions > Apps Script.
 */

var WORKBOOK_TITLE = 'GESTION_EQUIPE_GAZ_SIDI_ALI';
var DRIVE_FOLDER_NAME = 'GESTION_EQUIPE_GAZ_SIDI_ALI_FICHIERS';

var SHEETS_SCHEMA = [
  {
    name: 'AGENTS',
    headers: [
      'agent_id', 'matricule', 'nom', 'prenom', 'telephone',
      'fonction', 'role', 'statut', 'date_creation', 'derniere_connexion'
    ]
  },
  {
    name: 'TACHES',
    headers: [
      'task_id', 'numero_tache', 'titre', 'categorie', 'description',
      'instructions', 'commune', 'dp', 'adresse', 'latitude', 'longitude',
      'priorite', 'date_creation', 'date_debut_prevue', 'date_fin_prevue',
      'statut_global', 'createur_id', 'updated_at'
    ]
  },
  {
    name: 'AFFECTATIONS',
    headers: [
      'assignment_id', 'task_id', 'agent_id', 'date_affectation',
      'statut_agent', 'date_acceptation', 'date_debut', 'date_fin'
    ]
  },
  {
    name: 'COMPTES_RENDUS',
    headers: [
      'report_id', 'task_id', 'agent_id', 'version', 'travail_effectue',
      'resultat', 'difficultes', 'materiel', 'travaux_restants',
      'recommandations', 'date_soumission', 'validation', 'commentaire_chef'
    ]
  },
  {
    name: 'PHOTOS',
    headers: [
      'photo_id', 'task_id', 'report_id', 'agent_id', 'type_photo',
      'drive_file_id', 'drive_url', 'date_creation'
    ]
  },
  {
    name: 'HISTORIQUE',
    headers: [
      'history_id', 'task_id', 'user_id', 'action', 'ancien_etat',
      'nouvel_etat', 'ancienne_valeur', 'nouvelle_valeur', 'date_serveur'
    ]
  },
  {
    name: 'PARAMETRES',
    headers: [
      'param_id', 'categorie', 'valeur', 'libelle', 'actif'
    ]
  },
  {
    name: 'NOTIFICATIONS',
    headers: [
      'notification_id', 'user_id', 'task_id', 'titre', 'message',
      'date_creation', 'statut_envoi', 'date_lecture'
    ]
  },
  {
    name: 'EQUIPEMENTS',
    headers: [
      'equipment_id', 'designation', 'reference', 'quantite',
      'agent_id', 'date_sortie', 'date_retour', 'etat'
    ]
  },
  {
    name: 'SESSIONS_ET_APPAREILS',
    headers: [
      'device_id', 'user_id', 'plateforme', 'derniere_connexion',
      'token_notification', 'statut'
    ]
  },
  {
    name: 'SYNCHRONISATION',
    headers: [
      'operation_id', 'user_id', 'device_id', 'type_operation',
      'date_operation', 'statut', 'message_erreur'
    ]
  }
];

function setupDistrictGazWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create(WORKBOOK_TITLE);
  }
  ss.setSpreadsheetTimeZone('Africa/Algiers');

  SHEETS_SCHEMA.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }
    var range = sheet.getRange(1, 1, 1, def.headers.length);
    range.setValues([def.headers]);
    range.setFontWeight('bold');
    range.setBackground('#0055A4');
    range.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  });

  // Supprimer Feuille 1 par défaut si inutile
  var defaultSheet = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > SHEETS_SCHEMA.length) {
    ss.deleteSheet(defaultSheet);
  }

  // Dossier Drive dédié aux photos et sauvegardes
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);

  Logger.log('Classeur prêt ID : ' + ss.getId() + ' | URL : ' + ss.getUrl());
  Logger.log('Dossier Drive ID : ' + folder.getId());
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: folder.getId()
  };
}
