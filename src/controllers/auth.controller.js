const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const env = require('../config/env');

class AuthController {
  /**
   * Register a new user
   */
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body;

      // Check if user already exists
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email address already exists.',
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      // Generate JWT
      const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
      });

      res.status(201).json({
        success: true,
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user with email and password
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.',
        });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.',
        });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get authenticated user profile
   */
  async getMe(req, res) {
    res.json({
      success: true,
      data: req.user,
    });
  }
}

module.exports = new AuthController();
