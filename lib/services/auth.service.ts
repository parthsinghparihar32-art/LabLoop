import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile, UserRole } from '@/lib/types/models';
import { AuthenticationError, AuthorizationError } from '@/lib/types/api';

export class AuthService {
  /**
   * Retrieves the current authenticated user context from request cookies or auth header.
   */
  static async getCurrentUser() {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  }

  /**
   * Retrieves the current user's application profile including application role.
   */
  static async getCurrentProfile(): Promise<Profile | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;

    const adminClient = createAdminClient();
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return null;
    }

    return profile as Profile;
  }

  /**
   * Asserts that a user is authenticated, returning the profile. Throws AuthenticationError otherwise.
   */
  static async requireAuth(): Promise<Profile> {
    const profile = await this.getCurrentProfile();
    if (!profile) {
      throw new AuthenticationError('Authentication required to access this resource');
    }
    return profile;
  }

  /**
   * Asserts that the authenticated user possesses one of the required roles.
   */
  static async requireRole(allowedRoles: UserRole[]): Promise<Profile> {
    const profile = await this.requireAuth();
    if (!allowedRoles.includes(profile.role)) {
      throw new AuthorizationError(
        `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`
      );
    }
    return profile;
  }
}
