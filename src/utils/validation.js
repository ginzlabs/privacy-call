import { z } from 'zod';
import { AppConfig } from '../config/AppConfig';

/**
 * Validation Schemas for PrivacyCall
 * Uses Zod for runtime type checking and validation
 */

// Contact validation
export const ContactSchema = z.object({
  id: z.string().min(1, 'Contact ID is required'),
  nickname: z.string()
    .min(AppConfig.VALIDATION.MIN_NICKNAME_LENGTH, `Nickname must be at least ${AppConfig.VALIDATION.MIN_NICKNAME_LENGTH} character`)
    .max(AppConfig.VALIDATION.MAX_NICKNAME_LENGTH, `Nickname must be no more than ${AppConfig.VALIDATION.MAX_NICKNAME_LENGTH} characters`)
    .trim(),
  uid: z.string().min(1, 'User ID is required'),
  addedAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

// Group member validation (simplified contact for group membership)
export const GroupMemberSchema = z.object({
  id: z.string().min(1, 'Member ID is required'),
  nickname: z.string()
    .min(AppConfig.VALIDATION.MIN_NICKNAME_LENGTH, `Nickname must be at least ${AppConfig.VALIDATION.MIN_NICKNAME_LENGTH} character`)
    .max(AppConfig.VALIDATION.MAX_NICKNAME_LENGTH, `Nickname must be no more than ${AppConfig.VALIDATION.MAX_NICKNAME_LENGTH} characters`)
    .trim(),
  uid: z.string().min(1, 'User ID is required'),
});

// Group validation
export const GroupSchema = z.object({
  id: z.string().min(1, 'Group ID is required'),
  name: z.string()
    .min(1, 'Group name is required')
    .max(AppConfig.VALIDATION.MAX_GROUP_NAME_LENGTH, `Group name must be no more than ${AppConfig.VALIDATION.MAX_GROUP_NAME_LENGTH} characters`)
    .trim(),
  members: z.array(GroupMemberSchema).min(2, 'Group must have at least 2 members'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

// Invite validation
export const InviteSchema = z.object({
  id: z.string().min(1, 'Invite ID is required'),
  token: z.string().min(32, 'Invalid invite token'),
  createdBy: z.string().min(1, 'Creator ID is required'),
  createdByNickname: z.string()
    .min(AppConfig.VALIDATION.MIN_NICKNAME_LENGTH)
    .max(AppConfig.VALIDATION.MAX_NICKNAME_LENGTH)
    .trim(),
  status: z.enum(['pending', 'accepted', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  acceptedBy: z.string().optional(),
  acceptedAt: z.string().datetime().optional(),
});

// History entry validation
export const HistoryEntrySchema = z.object({
  type: z.enum([
    'call_outgoing',
    'call_incoming',
    'call_missed',
    'call_failed',
    'call_cancelled',
    'call_timeout',
    'call_ended',
    'contact_added',
    'contact_removed',
    'contact_removed_by_other', // Mutual deletion - contact deleted by other party
    'contact_updated',
    'group_created',
    'invite_deleted',
    'invite_created'
  ]),
  timestamp: z.string().datetime(),
  contactName: z.string().optional(),
  contactNickname: z.string().optional(),
  groupName: z.string().optional(),
  memberCount: z.number().optional(),
  duration: z.number().optional(), // in seconds
});

// User settings validation
export const UserSettingsSchema = z.object({
  soundEnabled: z.boolean().default(true),
  vibrationEnabled: z.boolean().default(true),
  autoAnswer: z.boolean().default(false),
});

// Usage tracking validation
export const UsageEntrySchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  callType: z.enum(['direct', 'group']),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationSeconds: z.number().min(0),
  participantCount: z.number().min(1).max(AppConfig.MAX_GROUP_PARTICIPANTS),
});

// Validation helper functions
export const validateContact = (data) => {
  try {
    return ContactSchema.parse(data);
  } catch (error) {
    console.error('Contact validation error:', error.errors);
    throw new Error(`Invalid contact data: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

export const validateGroup = (data) => {
  try {
    return GroupSchema.parse(data);
  } catch (error) {
    console.error('Group validation error:', error.errors);
    throw new Error(`Invalid group data: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

export const validateInvite = (data) => {
  try {
    return InviteSchema.parse(data);
  } catch (error) {
    console.error('Invite validation error:', error.errors);
    throw new Error(`Invalid invite data: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

export const validateHistoryEntry = (data) => {
  try {
    return HistoryEntrySchema.parse(data);
  } catch (error) {
    console.error('History entry validation error:', error.errors);
    throw new Error(`Invalid history entry: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

export const validateUserSettings = (data) => {
  try {
    return UserSettingsSchema.parse(data);
  } catch (error) {
    console.error('User settings validation error:', error.errors);
    throw new Error(`Invalid settings: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

export const validateUsageEntry = (data) => {
  try {
    return UsageEntrySchema.parse(data);
  } catch (error) {
    console.error('Usage entry validation error:', error.errors);
    throw new Error(`Invalid usage data: ${error.errors[0]?.message || 'Unknown error'}`);
  }
};

// Sanitization helpers
export const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return '';
  return nickname.trim().slice(0, AppConfig.VALIDATION.MAX_NICKNAME_LENGTH);
};

export const sanitizeGroupName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, AppConfig.VALIDATION.MAX_GROUP_NAME_LENGTH);
};

// Validation constants
export const VALIDATION_ERRORS = {
  NICKNAME_TOO_SHORT: `Nickname must be at least ${AppConfig.VALIDATION.MIN_NICKNAME_LENGTH} character`,
  NICKNAME_TOO_LONG: `Nickname must be no more than ${AppConfig.VALIDATION.MAX_NICKNAME_LENGTH} characters`,
  GROUP_NAME_TOO_LONG: `Group name must be no more than ${AppConfig.VALIDATION.MAX_GROUP_NAME_LENGTH} characters`,
  GROUP_TOO_FEW_MEMBERS: 'Group must have at least 2 members',
  GROUP_TOO_MANY_MEMBERS: `Group cannot have more than ${AppConfig.MAX_GROUP_PARTICIPANTS} members`,
  INVALID_UID: 'Invalid user ID format',
  INVALID_TOKEN: 'Invalid invite token format',
};

export default {
  ContactSchema,
  GroupMemberSchema,
  GroupSchema,
  InviteSchema,
  HistoryEntrySchema,
  UserSettingsSchema,
  UsageEntrySchema,
  validateContact,
  validateGroup,
  validateInvite,
  validateHistoryEntry,
  validateUserSettings,
  validateUsageEntry,
  sanitizeNickname,
  sanitizeGroupName,
  VALIDATION_ERRORS,
};