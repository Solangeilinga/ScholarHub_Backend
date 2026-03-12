parseLevel(levelStr) {
  if (!levelStr) return []
  const str = levelStr.toUpperCase()
  const levels = []

  if (str.includes('BEPC') || str.includes('COLLÈGE')) levels.push('BEPC')
  if ((str.includes('BAC') || str.includes('BACCALAURÉAT')) && !str.includes('MASTER') && !str.includes('BACHELOR')) levels.push('BACCALAUREAT')
  if (str.includes('LICENCE_1') || str.includes('L1') || str.includes('1ÈRE ANNÉE LICENCE')) levels.push('LICENCE_1')
  if (str.includes('LICENCE_2') || str.includes('L2') || str.includes('2ÈME ANNÉE LICENCE')) levels.push('LICENCE_2')
  if (str.includes('LICENCE_3') || str.includes('L3') || str.includes('3ÈME ANNÉE LICENCE')) levels.push('LICENCE_3')
  if ((str.includes('LICENCE') || str.includes('BACHELOR') || str.includes('UNDERGRADUATE')) && !str.includes('LICENCE_')) levels.push('LICENCE')
  if (str.includes('MAÎTRISE') || str.includes('MAITRISE')) levels.push('MAITRISE')
  if (str.includes('MASTER_1') || str.includes('M1') || str.includes('MASTER 1')) levels.push('MASTER_1')
  if (str.includes('MASTER_2') || str.includes('M2') || str.includes('MASTER 2')) levels.push('MASTER_2')
  if ((str.includes('MASTER') || str.includes('MSC') || str.includes('MBA')) && !str.includes('MASTER_')) levels.push('MASTER')
  if (str.includes('DOCTORAT_1') || str.includes('D1')) levels.push('DOCTORAT_1')
  if (str.includes('DOCTORAT_2') || str.includes('D2')) levels.push('DOCTORAT_2')
  if ((str.includes('DOCTORAT') || str.includes('PHD') || str.includes('DOCTORATE')) && !str.includes('DOCTORAT_')) levels.push('DOCTORAT')

  return [...new Set(levels.length > 0 ? levels : ['MASTER', 'LICENCE'])]
}

parseType(typeStr) {
  if (!typeStr) return 'COMPLETE'
  const str = typeStr.toUpperCase()
  if (str.includes('PARTIELLE') || str.includes('PARTIAL')) return 'PARTIELLE'
  if (str.includes('RECHERCHE') || str.includes('RESEARCH')) return 'RECHERCHE'
  if (str.includes('FORMATION') || str.includes('TRAINING')) return 'FORMATION'
  // ECHANGE n'existe pas → mapper vers FORMATION
  if (str.includes('ECHANGE') || str.includes('EXCHANGE') || str.includes('ERASMUS')) return 'FORMATION'
  return 'COMPLETE'
}

parseLanguages(text) {
  const lower = text.toLowerCase()
  const langs = []
  // Codes EN MAJUSCULES comme dans tes constantes
  if (lower.includes('français') || lower.includes('french') || lower.includes('francophone')) langs.push('FR')
  if (lower.includes('anglais') || lower.includes('english') || lower.includes('anglophone')) langs.push('EN')
  if (lower.includes('portugais') || lower.includes('portuguese')) langs.push('PT')
  if (lower.includes('arabe') || lower.includes('arabic')) langs.push('AR')
  if (lower.includes('espagnol') || lower.includes('spanish')) langs.push('ES')
  if (lower.includes('allemand') || lower.includes('german') || lower.includes('deutsch')) langs.push('DE')
  if (lower.includes('chinois') || lower.includes('chinese') || lower.includes('mandarin')) langs.push('ZH')
  if (lower.includes('russe') || lower.includes('russian')) langs.push('RU')
  if (lower.includes('italien') || lower.includes('italian')) langs.push('IT')
  if (lower.includes('japonais') || lower.includes('japanese')) langs.push('JA')
  if (lower.includes('coréen') || lower.includes('korean')) langs.push('KO')
  return langs.length > 0 ? langs : ['FR']
}

parseCountries(text) {
  const lower = text.toLowerCase()

  if (lower.includes('all african') || lower.includes('tous les pays africain') || lower.includes('sub-saharan') || lower.includes('afrique subsaharienne')) {
    // Tous les codes de ta liste COUNTRIES
    return ['DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW']
  }

  const countryMap = {
    'algérie': 'DZ', 'algeria': 'DZ',
    'angola': 'AO',
    'bénin': 'BJ', 'benin': 'BJ',
    'botswana': 'BW',
    'burkina': 'BF', 'burkina faso': 'BF',
    'burundi': 'BI',
    'cap-vert': 'CV', 'cape verde': 'CV',
    'cameroun': 'CM', 'cameroon': 'CM',
    'centrafrique': 'CF', 'central african': 'CF',
    'tchad': 'TD', 'chad': 'TD',
    'comores': 'KM', 'comoros': 'KM',
    'congo': 'CG',
    'rdc': 'CD', 'rd congo': 'CD', 'democratic republic': 'CD',
    "côte d'ivoire": 'CI', 'ivory coast': 'CI', "cote d'ivoire": 'CI',
    'djibouti': 'DJ',
    'égypte': 'EG', 'egypt': 'EG',
    'guinée équatoriale': 'GQ', 'equatorial guinea': 'GQ',
    'érythrée': 'ER', 'eritrea': 'ER',
    'eswatini': 'SZ', 'swaziland': 'SZ',
    'éthiopie': 'ET', 'ethiopia': 'ET',
    'gabon': 'GA',
    'gambie': 'GM', 'gambia': 'GM',
    'ghana': 'GH',
    'guinée': 'GN', 'guinea': 'GN',
    'guinée-bissau': 'GW', 'guinea-bissau': 'GW',
    'kenya': 'KE',
    'lesotho': 'LS',
    'liberia': 'LR',
    'libye': 'LY', 'libya': 'LY',
    'madagascar': 'MG',
    'malawi': 'MW',
    'mali': 'ML',
    'mauritanie': 'MR', 'mauritania': 'MR',
    'maurice': 'MU', 'mauritius': 'MU',
    'maroc': 'MA', 'morocco': 'MA',
    'mozambique': 'MZ',
    'namibie': 'NA', 'namibia': 'NA',
    'niger': 'NE',
    'nigeria': 'NG',
    'rwanda': 'RW',
    'sao tomé': 'ST', 'sao tome': 'ST',
    'sénégal': 'SN', 'senegal': 'SN',
    'seychelles': 'SC',
    'sierra leone': 'SL',
    'somalie': 'SO', 'somalia': 'SO',
    'afrique du sud': 'ZA', 'south africa': 'ZA',
    'soudan du sud': 'SS', 'south sudan': 'SS',
    'soudan': 'SD', 'sudan': 'SD',
    'tanzanie': 'TZ', 'tanzania': 'TZ',
    'togo': 'TG',
    'tunisie': 'TN', 'tunisia': 'TN',
    'ouganda': 'UG', 'uganda': 'UG',
    'zambie': 'ZM', 'zambia': 'ZM',
    'zimbabwe': 'ZW',
  }

  const found = []
  for (const [keyword, code] of Object.entries(countryMap)) {
    if (lower.includes(keyword) && !found.includes(code)) {
      found.push(code)
    }
  }

  // Défaut : Afrique de l'Ouest francophone
  return found.length > 0 ? found : ['BF', 'CI', 'SN', 'ML', 'GN', 'TG', 'BJ', 'NE', 'CM']
}

parseFields(text) {
  const lower = text.toLowerCase()
  const fields = []
  const fieldMap = {
    'informatique': 'Informatique', 'computer': 'Informatique', 'it ': 'Informatique', 'numérique': 'Informatique',
    'médecine': 'Médecine', 'medicine': 'Médecine', 'médical': 'Médecine', 'santé': 'Santé publique', 'health': 'Santé publique',
    'droit': 'Droit', 'law': 'Droit', 'juridique': 'Droit',
    'économie': 'Économie', 'economics': 'Économie', 'économique': 'Économie',
    'ingénierie': 'Ingénierie', 'engineering': 'Ingénierie', 'génie': 'Ingénierie',
    'sciences': 'Sciences', 'science': 'Sciences',
    'agriculture': 'Agriculture', 'agronomie': 'Agriculture',
    'architecture': 'Architecture',
    'éducation': 'Éducation', 'education': 'Éducation', 'enseignement': 'Éducation',
    'arts': 'Arts', 'art ': 'Arts', 'culture': 'Arts',
    'environnement': 'Environnement', 'environment': 'Environnement', 'écologie': 'Environnement',
    'finance': 'Finance', 'comptabilité': 'Finance', 'banking': 'Finance',
    'management': 'Management', 'gestion': 'Management', 'business': 'Management',
    'mathématiques': 'Mathématiques', 'mathematics': 'Mathématiques', 'maths': 'Mathématiques',
    'physique': 'Physique', 'physics': 'Physique',
    'chimie': 'Chimie', 'chemistry': 'Chimie',
    'biologie': 'Biologie', 'biology': 'Biologie', 'biotechnologie': 'Biologie',
    'sociologie': 'Sociologie', 'sociology': 'Sociologie', 'social': 'Sociologie',
    'communication': 'Communication', 'journalisme': 'Communication', 'journalism': 'Communication',
  }

  for (const [keyword, field] of Object.entries(fieldMap)) {
    if (lower.includes(keyword) && !fields.includes(field)) {
      fields.push(field)
    }
  }
  return fields
}