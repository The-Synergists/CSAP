import { Router } from 'express';
import { runVerification } from '../controllers/verification.controller.js';

const router = Router();

router.post('/run', runVerification);

export default router;
