const prisma = require('../../config/db');
const { sendEmail } = require('../../utils/mailer');

// Étudiant crée un ticket
const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const userId = req.user.id;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Sujet et message requis' });
    }

    const ticket = await prisma.supportTicket.create({
      data: { userId, subject, message },
      include: { user: { select: { name: true, email: true } } },
    });

    res.status(201).json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Étudiant voit ses tickets
const getMyTickets = async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tickets });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// NOUVEAU : Étudiant supprime un ticket
const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Vérifier que le ticket existe et appartient à l'utilisateur
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: id,
        userId: userId
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    // Optionnel : Empêcher la suppression des tickets déjà répondus
    if (ticket.status === 'ANSWERED') {
      return res.status(400).json({ 
        error: 'Impossible de supprimer un ticket qui a déjà reçu une réponse' 
      });
    }

    // Supprimer le ticket
    await prisma.supportTicket.delete({
      where: { id: id }
    });

    res.json({ 
      success: true, 
      message: 'Ticket supprimé avec succès' 
    });
  } catch (error) {
    console.error('Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du ticket' });
  }
};

// Admin voit tous les tickets
const getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, country: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: await prisma.supportTicket.count(),
      open: await prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      answered: await prisma.supportTicket.count({ where: { status: 'ANSWERED' } }),
    };

    res.json({ tickets, stats });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin répond à un ticket
const replyTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) return res.status(400).json({ error: 'Réponse requise' });

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { reply, status: 'ANSWERED' },
      include: { user: { select: { name: true, email: true } } },
    });

    // Envoyer email à l'étudiant
    await sendEmail({
      to: ticket.user.email,
      subject: `✅ ScholarHub - Réponse à votre demande : ${ticket.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1A1F8F; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">ScholarHub</h1>
          </div>
          <div style="padding: 30px; background: white; border: 1px solid #eee;">
            <h2 style="color: #0D0E2E;">Bonjour ${ticket.user.name} 👋</h2>
            <p style="color: #6B7280;">Notre équipe a répondu à votre demande :</p>
            <div style="background: #F5F6FF; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #1A1F8F;">
              <p style="font-weight: bold; color: #0D0E2E; margin: 0 0 8px;">Votre question :</p>
              <p style="color: #6B7280; margin: 0;">${ticket.message}</p>
            </div>
            <div style="background: #F0FFF4; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #10B981;">
              <p style="font-weight: bold; color: #0D0E2E; margin: 0 0 8px;">Réponse de l'équipe :</p>
              <p style="color: #374151; margin: 0;">${reply}</p>
            </div>
            <p style="color: #6B7280; font-size: 14px;">Si vous avez d'autres questions, n'hésitez pas à nous contacter depuis l'application.</p>
          </div>
        </div>
      `,
    });

    // Notification in-app
    await prisma.notification.create({
      data: {
        userId: ticket.userId,
        title: 'Réponse à votre demande',
        body: `Notre équipe a répondu à : "${ticket.subject}"`,
        type: 'SUPPORT_REPLY',
        data: { ticketId: ticket.id },
      },
    });

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin ferme un ticket
const closeTicket = async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED' },
    });
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { 
  createTicket, 
  getMyTickets, 
  deleteTicket, // ← NOUVEAU
  getAllTickets, 
  replyTicket, 
  closeTicket 
};