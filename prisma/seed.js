const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ScholarHub database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@scholarhub.africa' },
    update: {},
    create: {
      name: 'Admin ScholarHub',
      email: 'admin@scholarhub.africa',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isVerified: true,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create sample scholarships
  const scholarships = [
    {
      title: 'Bourse de la Fondation Mo Ibrahim',
      description: 'La Fondation Mo Ibrahim offre des bourses aux étudiants africains pour des études supérieures en gouvernance, leadership et développement durable en Afrique.',
      provider: 'Fondation Mo Ibrahim',
      type: 'COMPLETE',
      countries: ['NG', 'GH', 'KE', 'SN', 'CI', 'CM', 'ET', 'TZ', 'UG', 'ZA', 'BF', 'ML', 'TG', 'BJ', 'NE'],
      fields: ['Gouvernance', 'Politique publique', 'Droit', 'Sciences sociales', 'Économie'],
      level: ['MASTER', 'DOCTORAT'],
      amount: 50000,
      currency: 'USD',
      deadline: new Date('2025-06-30'),
      startDate: new Date('2025-09-01'),
      duration: '2 ans',
      link: 'https://mo.ibrahim.foundation/aga-khan-graduate-scholarships',
      requirements: 'Être ressortissant africain, avoir moins de 35 ans, excellents résultats académiques',
      benefits: ['Frais de scolarité complets', 'Allocation mensuelle', 'Billet d\'avion', 'Assurance maladie'],
      languages: ['Français', 'Anglais'],
      isActive: true,
      isFeatured: true,
    },
    {
      title: 'Bourse de l\'Union Africaine',
      description: 'L\'Union Africaine offre des bourses d\'études pour permettre aux jeunes africains de poursuivre des études supérieures dans les universités africaines.',
      provider: 'Union Africaine',
      type: 'COMPLETE',
      countries: ['BF', 'ML', 'TG', 'BJ', 'NE', 'SN', 'CI', 'GN', 'MR', 'GA'],
      fields: ['Sciences', 'Technologie', 'Ingénierie', 'Mathématiques', 'Agriculture', 'Santé'],
      level: ['LICENCE', 'MASTER', 'DOCTORAT'],
      amount: 15000,
      currency: 'USD',
      deadline: new Date('2025-04-30'),
      duration: '3-5 ans',
      link: 'https://au.int/scholarships',
      requirements: 'Nationalité africaine, dossier académique solide, lettre de motivation',
      benefits: ['Frais de scolarité', 'Hébergement', 'Allocation mensuelle'],
      languages: ['Français', 'Anglais', 'Arabe', 'Portugais'],
      isActive: true,
      isFeatured: true,
    },
    {
      title: 'Bourse Mastercard Foundation - Université de Toronto',
      description: 'La Mastercard Foundation en partenariat avec l\'Université de Toronto offre des bourses complètes aux étudiants africains talentueux et économiquement défavorisés.',
      provider: 'Mastercard Foundation',
      type: 'COMPLETE',
      countries: ['GH', 'KE', 'NG', 'ET', 'TZ', 'UG', 'RW', 'ZM', 'MZ', 'SN'],
      fields: ['Tous domaines'],
      level: ['LICENCE', 'MASTER'],
      amount: 70000,
      currency: 'CAD',
      deadline: new Date('2025-12-01'),
      startDate: new Date('2026-09-01'),
      duration: '4 ans',
      link: 'https://mastercardscholars.utoronto.ca',
      requirements: 'Excellence académique, leadership, engagement communautaire, besoin financier',
      benefits: ['Scolarité complète', 'Logement', 'Transport', 'Mentorat', 'Développement professionnel'],
      languages: ['Anglais'],
      isActive: true,
      isFeatured: true,
    },
    {
      title: 'Bourse du Gouvernement Français - Excellence-Major',
      description: 'Programme de bourses du gouvernement français destiné aux meilleurs étudiants étrangers souhaitant poursuivre des études en France.',
      provider: 'Campus France / Gouvernement Français',
      type: 'PARTIELLE',
      countries: ['BF', 'SN', 'CI', 'CM', 'ML', 'TG', 'BJ', 'NE', 'GA', 'CD', 'CG'],
      fields: ['Tous domaines'],
      level: ['MASTER', 'DOCTORAT'],
      amount: 700,
      currency: 'EUR',
      deadline: new Date('2025-03-31'),
      duration: '1-3 ans',
      link: 'https://www.campusfrance.org/fr/excellence-major',
      requirements: 'Excellents résultats, inscription dans un établissement français, dossier complet',
      benefits: ['Allocation mensuelle', 'Exonération frais inscription', 'Couverture sociale'],
      languages: ['Français'],
      isActive: true,
      isFeatured: false,
    },
    {
      title: 'Bourse DAAD Allemagne',
      description: 'Le service allemand d\'échanges universitaires (DAAD) propose des bourses aux étudiants africains pour des études et des recherches en Allemagne.',
      provider: 'DAAD',
      type: 'COMPLETE',
      countries: ['BF', 'NG', 'GH', 'KE', 'ET', 'TZ', 'CM', 'SN', 'ZA', 'EG'],
      fields: ['Ingénierie', 'Sciences', 'Architecture', 'Agriculture', 'Économie', 'Sciences sociales'],
      level: ['MASTER', 'DOCTORAT', 'POSTDOC'],
      amount: 1200,
      currency: 'EUR',
      deadline: new Date('2025-10-15'),
      duration: '1-4 ans',
      link: 'https://www.daad.de/en/studying-in-germany/scholarships/',
      requirements: 'Diplôme universitaire, connaissance de l\'allemand ou anglais, expérience professionnelle',
      benefits: ['Allocation mensuelle', 'Frais de voyage', 'Assurance santé', 'Cours de langue'],
      languages: ['Anglais', 'Allemand'],
      isActive: true,
      isFeatured: false,
    },
    {
      title: 'Bourse Banque Mondiale - Robert S. McNamara',
      description: 'La Banque mondiale soutient les chercheurs de pays en développement pour mener des recherches doctorales dans des institutions académiques reconnues.',
      provider: 'Banque Mondiale',
      type: 'RECHERCHE',
      countries: ['BF', 'ML', 'NE', 'GN', 'TD', 'MR', 'MZ', 'MW', 'ZM', 'RW'],
      fields: ['Économie du développement', 'Politique publique', 'Éducation', 'Santé', 'Agriculture'],
      level: ['DOCTORAT'],
      amount: 25000,
      currency: 'USD',
      deadline: new Date('2025-07-31'),
      duration: '10 mois',
      link: 'https://www.worldbank.org/en/programs/scholarships',
      requirements: 'Être inscrit en doctorat, nationalité d\'un pays éligible, projet de recherche pertinent',
      benefits: ['Allocation de recherche', 'Frais de voyage', 'Assurance'],
      languages: ['Français', 'Anglais'],
      isActive: true,
      isFeatured: true,
    },
  ];

  for (const scholarship of scholarships) {
    await prisma.scholarship.create({ data: scholarship });
  }
  console.log(`✅ ${scholarships.length} bourses créées`);

  console.log('🎉 Seed terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
