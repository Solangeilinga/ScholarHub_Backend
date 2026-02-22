const scholarshipService = require('./scholarship.service');

const getAll = async (req, res, next) => {
  try {
    const result = await scholarshipService.getAll(req.query);
    res.json(result);
  } catch (error) { next(error); }
};

const getAllAdmin = async (req, res, next) => {
  try {
    const result = await scholarshipService.getAllAdmin(req.query);
    res.json(result);
  } catch (error) { next(error); }
};



const getFeatured = async (req, res, next) => {
  try {
    const scholarships = await scholarshipService.getFeatured();
    res.json({ scholarships });
  } catch (error) { next(error); }
};

const getOne = async (req, res, next) => {
  try {
    const scholarship = await scholarshipService.getOne(req.params.id);
    res.json({ scholarship });
  } catch (error) { next(error); }
};

const getRecommended = async (req, res, next) => {
  try {
    const scholarships = await scholarshipService.getRecommended(req.user.id);
    res.json({ scholarships });
  } catch (error) { next(error); }
};

const saveScholarship = async (req, res, next) => {
  try {
    await scholarshipService.saveScholarship(req.user.id, req.params.id);
    res.json({ message: 'Bourse sauvegardée' });
  } catch (error) { next(error); }
};

const unsaveScholarship = async (req, res, next) => {
  try {
    await scholarshipService.unsaveScholarship(req.user.id, req.params.id);
    res.json({ message: 'Bourse retirée des favoris' });
  } catch (error) { next(error); }
};

const trackApplication = async (req, res, next) => {
  try {
    const application = await scholarshipService.trackApplication(req.user.id, req.params.id, req.body);
    res.status(201).json({ application });
  } catch (error) { next(error); }
};

const updateApplication = async (req, res, next) => {
  try {
    const application = await scholarshipService.updateApplication(req.user.id, req.params.id, req.body);
    res.json({ application });
  } catch (error) { next(error); }
};

const incrementView = async (req, res, next) => {
  try {
    await scholarshipService.incrementView(req.params.id);
    res.json({ message: 'OK' });
  } catch (error) { next(error); }
};

const getStats = async (req, res, next) => {
  try {
    const stats = await scholarshipService.getStats();
    res.json({ stats });
  } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try {
    const scholarship = await scholarshipService.create(req.body);
    res.status(201).json({ scholarship });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const scholarship = await scholarshipService.update(req.params.id, req.body);
    res.json({ scholarship });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    await scholarshipService.remove(req.params.id);
    res.json({ message: 'Bourse supprimée' });
  } catch (error) { next(error); }
};

module.exports = { getAll, getAllAdmin, getFeatured, getOne, getRecommended, saveScholarship, unsaveScholarship, trackApplication, updateApplication, incrementView, getStats, create, update, remove };
