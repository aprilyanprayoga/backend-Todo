import { Router } from 'express';
import { todoController } from '../controllers/todo.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createTodoSchema,
  listTodosQuerySchema,
  todoIdParamSchema,
  updateTodoSchema,
} from '../schemas/todo.schema';

export const todoRoutes = Router();

// Semua endpoint todo wajib terautentikasi.
todoRoutes.use(requireAuth);

todoRoutes.post('/', validate(createTodoSchema), asyncHandler(todoController.create));
todoRoutes.get('/', validate(listTodosQuerySchema, 'query'), asyncHandler(todoController.list));
todoRoutes.get('/:id', validate(todoIdParamSchema, 'params'), asyncHandler(todoController.get));
todoRoutes.patch(
  '/:id',
  validate(todoIdParamSchema, 'params'),
  validate(updateTodoSchema),
  asyncHandler(todoController.update),
);
todoRoutes.delete('/:id', validate(todoIdParamSchema, 'params'), asyncHandler(todoController.remove));
