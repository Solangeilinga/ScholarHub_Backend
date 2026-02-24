const express = require('express');
const router = express.Router();
const prisma = require('../../config/db');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

// GET - Récupérer les notifications
router.get('/', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ notifications });
  } catch (error) { next(error); }
});

// PATCH - Marquer une notification comme lue
router.patch('/:id/read', async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ message: 'Notification marquée comme lue' });
  } catch (error) { next(error); }
});

// PATCH - Marquer toutes les notifications comme lues
router.patch('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) { next(error); }
});

// GET - Compter les notifications non lues
router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    res.json({ count });
  } catch (error) { next(error); }
});

// ⚠️ IMPORTANT : Route spécifique AVANT la route dynamique
// DELETE - Supprimer toutes les notifications
router.delete('/all', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await prisma.notification.deleteMany({
      where: { userId: userId }
    });

    res.json({ 
      success: true, 
      message: `Toutes les notifications (${result.count}) ont été supprimées`,
      count: result.count
    });
  } catch (error) { 
    console.error('Erreur suppression toutes notifications:', error);
    next(error); 
  }
});

// DELETE - Supprimer une notification spécifique (DOIT ÊTRE APRÈS /all)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Vérifier que la notification appartient à l'utilisateur
    const notification = await prisma.notification.findFirst({
      where: {
        id: id,
        userId: userId
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée' });
    }

    // Supprimer la notification
    await prisma.notification.delete({
      where: { id: id }
    });

    res.json({ 
      success: true, 
      message: 'Notification supprimée avec succès' 
    });
  } catch (error) { 
    console.error('Erreur suppression notification:', error);
    next(error); 
  }
});

module.exports = router;