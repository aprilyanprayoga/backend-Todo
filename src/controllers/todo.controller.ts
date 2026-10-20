import type { Request, Response } from 'express';
import { todoService } from '../services/todo.service';
import { getAuth } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import type { ListTodosQuery } from '../schemas/todo.schema';

export const todoController = {
  async list(req: Request, res: Response) {
    const { accessToken, userId } = getAuth(req);
    const { items, meta } = await todoService.list(accessToken, userId, req.query as unknown as ListTodosQuery);
    sendSuccess(res, items, 200, meta);
  },
  async get(req: Request, res: Response) {
    const { accessToken, userId } = getAuth(req);
    sendSuccess(res, await todoService.getById(accessToken, userId, req.params.id as string));
  },
  async create(req: Request, res: Response) {
    const { accessToken, userId } = getAuth(req);
    sendSuccess(res, await todoService.create(accessToken, userId, req.body), 201);
  },
  async update(req: Request, res: Response) {
    const { accessToken, userId } = getAuth(req);
    sendSuccess(res, await todoService.update(accessToken, userId, req.params.id as string, req.body));
  },
  async remove(req: Request, res: Response) {
    const { accessToken, userId } = getAuth(req);
    sendSuccess(res, await todoService.remove(accessToken, userId, req.params.id as string));
  },
};
