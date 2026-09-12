export interface PrivateUserProfile {
  id: string;
  senatiId: string;
  firstNames: string;
  lastNames: string;
  birthDate: string;
  age: number;
  trainerName: string;
  role: 'student' | 'teacher';
  profileVersion: number;
  avatarUrl: string | null;
}
export interface InitialReward {
  instanceId: string;
  speciesId: number;
  probabilitiesVersion: number;
}
export interface AccountProfile {
  user: PrivateUserProfile;
  initial: InitialReward | null;
}
export interface AuthenticatedProfile extends AccountProfile {
  session: { expiresAt: number };
}
