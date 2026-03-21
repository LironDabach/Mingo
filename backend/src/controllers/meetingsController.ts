import { Response } from "express";
import meetingsModel from "../models/meetingsModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";

class meetingsController extends baseController {
  constructor() {
    super(meetingsModel);
  }
}

export default new meetingsController();
