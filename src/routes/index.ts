import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { healthRoutes } from './health.routes';
import { todoRoutes } from './todo.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/todos', todoRoutes);
