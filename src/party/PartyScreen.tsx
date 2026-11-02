import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Users, Crown, Copy, Check, Share2,
  Radio, AlertCircle, LogOut, Sparkles,
  Music, Loader2, Lock, UserMinus, UserPlus,
  SkipForward, ListMusic, Plus, Trash2,
  Bell, BellOff, Camera, Edit3, Shield,
  CheckCircle2, UserX, Ban, User as UserIcon, X
} from 'lucide-react';
import { PartyService, triggerHapticFeedback } from './PartyService';
import { PartyState, PartyMember, PARTY_REACTION_EMOJIS, PartyTrack } from './types';
import { audioEngine } from '../services/audioEngine';
import { registerBackHandler } from '../services/navigation';
import { Song } from '../types/music';
import {
  getPartyBackend,
  PartyProfile,
  FriendRequest,
  PartyInvite,
  PresenceInfo,
  PARTY_ID_ALPHABET,
  isValidPartyId,
} from './backend';
import { Avatar } from './components/Avatar';
import { processProfilePhoto } from './utils/photoProcessor';

interface PartyScreenProps {
  onBack: () => void;
  onNavigateToCloud?: () => void;
  songs?: Song[];
}

type LobbyTab = 'rooms' | 'friends' | 'profile';
type FriendsSubTab = 'friends' | 'requests' | 'blocked';

const USERNAME_REGEX = /^[a-zA-Z0-9 ._-]{2,20}$/;

export const PartyScreen: React.FC<PartyScreenProps> = ({ onBack, onNavigateToCloud, songs = [] }) => {
  const backend = getPartyBackend();

  // Core party state & room sync
  const [partyState, setPartyState] = useState<PartyState>(PartyService.getState());
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Social Account & Profile states
  const [profile, setProfile] = useState<PartyProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [newUsernameInput, setNewUsernameInput] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Lobby navigation tabs
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('rooms');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('friends');

  // Friends & Social data
  const [friends, setFriends] = useState<PartyProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<PartyProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PartyInvite[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});

  // Add friend form
  const [addFriendInput, setAddFriendInput] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [socialActionMsg, setSocialActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Photo change & preview states
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile username edit
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editUsernameVal, setEditUsernameVal] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [copiedMyId, setCopiedMyId] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Add Songs to Party modal (for host)
  const [showAddSongsModal, setShowAddSongsModal] = useState(false);

  // Invite friends in active room modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());

  // Leave / End confirmation modal
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Synced progress seconds
  const [currentPlaybackSec, setCurrentPlaybackSec] = useState<number>(0);

  // Clear old errors on mount
  useEffect(() => {
    PartyService.clearErrorMessage();
    setLocalError(null);
    setProfileError(null);
    setSocialActionMsg(null);
  }, []);

  // Auto-dismiss errors after 5 seconds
  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => setLocalError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [localError]);

  useEffect(() => {
    if (partyState.errorMessage) {
      const timer = setTimeout(() => PartyService.clearErrorMessage(), 5000);
      return () => clearTimeout(timer);
    }
  }, [partyState.errorMessage]);

  useEffect(() => {
    if (profileError) {
      const timer = setTimeout(() => setProfileError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [profileError]);

  useEffect(() => {
    if (socialActionMsg) {
      const timer = setTimeout(() => setSocialActionMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [socialActionMsg]);

  // Subscribe to PartyService state
  useEffect(() => {
    return PartyService.subscribe((state) => {
      setPartyState(state);
    });
  }, []);

  // Load Party Profile on mount
  const loadUserProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const p = await backend.loadProfile();
      setProfile(p);
      if (p) {
        PartyService.setProfile({
          username: p.username,
          id: p.id,
          avatarUrl: p.avatarUrl,
        });
      }
    } catch (err) {
      console.warn('Failed to load party profile:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [backend]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  // Load Social Lists (Friends, Requests, Blocked, Invites)
  const refreshSocialLists = useCallback(async () => {
    if (!profile) return;
    try {
      const [fList, rList, bList, iList] = await Promise.all([
        backend.listFriends(),
        backend.listFriendRequests(),
        backend.listBlockedUsers(),
        backend.listPendingInvites(),
      ]);
      setFriends(fList);
      setFriendRequests(rList);
      setBlockedUsers(bList);
      setPendingInvites(iList);

      const allIds = fList.map((f) => f.id);
      if (allIds.length > 0) {
        const presences = await backend.getPresence(allIds);
        setPresenceMap(presences);
      }
    } catch (err) {
      console.warn('Failed to load social lists:', err);
    }
  }, [backend, profile]);

  useEffect(() => {
    if (profile) {
      refreshSocialLists();
    }
  }, [profile, refreshSocialLists]);

  // Subscribe to Presence & Invites
  useEffect(() => {
    if (!profile) return;

    const unsubPresence = backend.subscribePresence((presences) => {
      setPresenceMap((prev) => ({ ...prev, ...presences }));
    });

    const unsubInvites = backend.subscribeInvites((invs) => {
      setPendingInvites(invs);
    });

    return () => {
      unsubPresence();
      unsubInvites();
    };
  }, [backend, profile]);

  // Register Android back gesture to exit full-screen party without disconnecting
  useEffect(() => {
    return registerBackHandler('party_fullscreen', 85, () => {
      handleBack();
      return true;
    });
  }, [onBack]);

  // Update progress bar while playing
  useEffect(() => {
    if (!partyState.roomCode || partyState.playbackStatus !== 'playing') return;

    const interval = setInterval(() => {
      setCurrentPlaybackSec(audioEngine.currentTime);
    }, 500);

    return () => clearInterval(interval);
  }, [partyState.roomCode, partyState.playbackStatus]);

  // Handle Back: leaves full-screen without leaving active room
  const handleBack = () => {
    triggerHapticFeedback();
    onBack();
  };

  // =========================================================================
  // PROFILE ACTIONS
  // =========================================================================

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHapticFeedback();
    const clean = newUsernameInput.trim();
    if (!USERNAME_REGEX.test(clean)) {
      setProfileError('Username must be 2 to 20 characters (letters, numbers, space, dot, underscore or hyphen).');
      return;
    }

    setIsCreatingProfile(true);
    setProfileError(null);
    try {
      const created = await backend.createProfile(clean);
      setProfile(created);
      PartyService.setProfile({
        username: created.username,
        id: created.id,
        avatarUrl: created.avatarUrl,
      });
      await refreshSocialLists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile.';
      setProfileError(msg);
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    setProfileError(null);
    try {
      const croppedJpeg = await processProfilePhoto(file);
      setPendingPhotoUrl(croppedJpeg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not process selected image.';
      setLocalError(msg);
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmPhoto = async () => {
    if (!pendingPhotoUrl) return;
    triggerHapticFeedback();
    try {
      const updated = await backend.updateProfile({ avatarUrl: pendingPhotoUrl });
      setProfile(updated);
      PartyService.setProfile({
        username: updated.username,
        id: updated.id,
        avatarUrl: updated.avatarUrl,
      });
      setPendingPhotoUrl(null);
      setSocialActionMsg({ type: 'success', text: 'Profile photo updated!' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save photo.';
      setLocalError(msg);
    }
  };

  const handleChooseAnotherPhoto = () => {
    setPendingPhotoUrl(null);
    fileInputRef.current?.click();
  };

  const handleSaveUsername = async () => {
    triggerHapticFeedback();
    const clean = editUsernameVal.trim();
    if (!USERNAME_REGEX.test(clean)) {
      setSocialActionMsg({ type: 'error', text: 'Username must be 2 to 20 characters.' });
      return;
    }

    setIsSavingUsername(true);
    try {
      const updated = await backend.updateProfile({ username: clean });
      setProfile(updated);
      PartyService.setProfile({
        username: updated.username,
        id: updated.id,
        avatarUrl: updated.avatarUrl,
      });
      setIsEditingUsername(false);
      setSocialActionMsg({ type: 'success', text: 'Username updated!' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update username.';
      setSocialActionMsg({ type: 'error', text: msg });
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleCopyMyId = async () => {
    if (!profile) return;
    triggerHapticFeedback();
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedMyId(true);
      setTimeout(() => setCopiedMyId(false), 2000);
    } catch {
      setCopiedMyId(true);
      setTimeout(() => setCopiedMyId(false), 2000);
    }
  };

  const handleShareMyId = async () => {
    if (!profile) return;
    triggerHapticFeedback();
    const shareText = `Add me on JTEC Party! My Party ID is ${profile.id}. Open JTEC MUSIC, go to Settings > JTEC Party to listen together!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My JTEC Party ID', text: shareText });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    handleCopyMyId();
  };

  const handleDeleteAccount = async () => {
    triggerHapticFeedback();
    setIsDeletingAccount(true);
    try {
      await backend.deleteProfile();
      setProfile(null);
      setShowDeleteAccountConfirm(false);
      setLobbyTab('rooms');
      setNewUsernameInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete profile.';
      setSocialActionMsg({ type: 'error', text: msg });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // =========================================================================
  // SOCIAL & FRIENDS ACTIONS
  // =========================================================================

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addFriendInput.trim();
    if (!raw) return;

    // Clean: spaces removed, case-insensitive
    const cleanId = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!isValidPartyId(cleanId)) {
      setSocialActionMsg({ type: 'error', text: 'Please enter a valid 8-character Party ID.' });
      return;
    }

    triggerHapticFeedback();
    setIsAddingFriend(true);
    setSocialActionMsg(null);
    try {
      await backend.sendFriendRequest(cleanId);
      setAddFriendInput('');
      setSocialActionMsg({
        type: 'success',
        text: 'Friend request sent successfully.',
      });
      await refreshSocialLists();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send friend request.';
      setSocialActionMsg({ type: 'error', text: msg });
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    triggerHapticFeedback();
    try {
      await backend.acceptFriendRequest(requestId);
      await refreshSocialLists();
      setSocialActionMsg({ type: 'success', text: 'Friend request accepted!' });
    } catch (err) {
      console.warn(err);
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    triggerHapticFeedback();
    try {
      await backend.declineFriendRequest(requestId);
      await refreshSocialLists();
    } catch (err) {
      console.warn(err);
    }
  };

  const handleRemoveFriend = async (friend: PartyProfile) => {
    triggerHapticFeedback();
    const conf = window.confirm(`Remove ${friend.username} from your friends?`);
    if (!conf) return;

    try {
      await backend.removeFriend(friend.id);
      await refreshSocialLists();
      setSocialActionMsg({ type: 'success', text: `${friend.username} removed from friends.` });
    } catch (err) {
      console.warn(err);
    }
  };

  const handleBlockUser = async (user: PartyProfile) => {
    triggerHapticFeedback();
    const conf = window.confirm(`Block ${user.username}? They will not be able to send you friend requests or party invites.`);
    if (!conf) return;

    try {
      await backend.blockUser(user.id);
      await refreshSocialLists();
      setSocialActionMsg({ type: 'success', text: `${user.username} blocked.` });
    } catch (err) {
      console.warn(err);
    }
  };

  const handleUnblockUser = async (user: PartyProfile) => {
    triggerHapticFeedback();
    try {
      await backend.unblockUser(user.id);
      await refreshSocialLists();
      setSocialActionMsg({ type: 'success', text: `${user.username} unblocked.` });
    } catch (err) {
      console.warn(err);
    }
  };

  // =========================================================================
  // ROOM ACTIONS
  // =========================================================================

  const handleCreateRoom = async () => {
    triggerHapticFeedback();
    setIsCreating(true);
    setLocalError(null);
    PartyService.clearErrorMessage();
    try {
      await PartyService.createRoom();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create party room.';
      setLocalError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (codeToJoin?: string) => {
    triggerHapticFeedback();
    const clean = (codeToJoin || joinCodeInput).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 6) {
      setLocalError('Please enter a 6-character room code (e.g. JT7K2M).');
      return;
    }
    setIsJoining(true);
    setLocalError(null);
    PartyService.clearErrorMessage();
    try {
      await PartyService.joinRoom(clean);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join party room.';
      setLocalError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleAcceptInvite = async (invite: PartyInvite) => {
    triggerHapticFeedback();
    try {
      const res = await backend.acceptInvite(invite.id);
      await handleJoinRoom(res.roomCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invite no longer available.';
      setLocalError(msg);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    triggerHapticFeedback();
    try {
      await backend.declineInvite(inviteId);
      await refreshSocialLists();
    } catch (err) {
      console.warn(err);
    }
  };

  const handleCopyCode = async () => {
    if (!partyState.roomCode) return;
    triggerHapticFeedback();
    try {
      await navigator.clipboard.writeText(partyState.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleShareRoom = async () => {
    if (!partyState.roomCode) return;
    triggerHapticFeedback();
    const shareText = `Join my JTEC Party! Open JTEC MUSIC, go to Settings > JTEC Party, and enter code ${partyState.roomCode}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my JTEC Party', text: shareText });
        return;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleInviteFriendToRoom = async (friendId: string) => {
    if (!partyState.roomCode) return;
    triggerHapticFeedback();
    setInvitedFriendIds((prev) => new Set(prev).add(friendId));
    try {
      await backend.sendInvite(friendId, partyState.roomCode);
    } catch (err) {
      console.warn('Failed to send invite:', err);
    }
  };

  const handleKickMember = (member: PartyMember) => {
    triggerHapticFeedback();
    const confirmKick = window.confirm(`Remove ${member.nickname} from this party room?`);
    if (confirmKick) {
      PartyService.kickMember(member.id);
    }
  };

  const handleConfirmLeaveOrEnd = async () => {
    setShowLeaveConfirm(false);
    triggerHapticFeedback();
    await PartyService.leaveRoom(true);
    onBack();
  };

  // Add a downloaded cloud song to party queue
  const handleAddSongToParty = (song: Song) => {
    if (!song.isCloud) return;
    triggerHapticFeedback();
    const partyTrack: PartyTrack = {
      source: 'cloud',
      id: song.id,
      title: song.title,
      artist: song.artist,
      cover: song.artworkUrl,
      audioUrl: song.audioUrl || '',
      duration: song.duration,
    };

    if (!partyState.currentTrack) {
      PartyService.hostSelectTrack(partyTrack);
    } else {
      PartyService.hostAddToQueue(partyTrack);
    }
    setShowAddSongsModal(false);
    setSocialActionMsg({ type: 'success', text: `Added "${song.title}" to Party!` });
  };

  const formatSeconds = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec || 0));
    const mins = Math.floor(s / 60);
    const remainder = s % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  const formatLastSeen = (timestamp: number) => {
    if (!timestamp) return 'Offline';
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const readyMembersCount = partyState.members.filter(
    (m) => m.status === 'ready' || m.status === 'playing'
  ).length;

  const totalMembers = Math.max(1, partyState.members.length);
  const skipVotesCount = partyState.skipVotes.length;
  const isMajoritySkip = skipVotesCount > Math.floor(totalMembers / 2);
  const hasSelfVotedSkip = partyState.skipVotes.includes(partyState.selfId);

  // =========================================================================
  // VIEW RENDER
  // =========================================================================

  return (
    <div className="fixed inset-0 z-50 bg-[#050811] text-slate-100 flex flex-col font-sans select-none overflow-hidden pt-safe pb-safe pl-safe pr-safe animate-in fade-in duration-200">
      {/* Hidden file input for native image picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Profile Photo Preview Modal (Requirement 3: circle preview with "Use this photo" and "Choose another") */}
      {pendingPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-cyan-500/30 p-6 space-y-5 text-center shadow-2xl">
            <h3 className="text-base font-bold text-white">Preview Profile Photo</h3>

            <div className="flex justify-center py-2">
              <Avatar
                url={pendingPhotoUrl}
                name={profile?.username || 'User'}
                size={112}
                className="border-2 border-cyan-400/60 shadow-xl"
              />
            </div>

            <p className="text-xs text-slate-400">
              Square centered preview (saved as compressed JPEG under 40 KB).
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
              >
                Use this photo
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleChooseAnotherPhoto}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold active:scale-95 transition cursor-pointer"
                >
                  Choose another
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPhotoUrl(null)}
                  className="px-4 min-h-[44px] py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white text-xs font-semibold active:scale-95 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Reactions Overlay */}
      {partyState.activeReactions.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {partyState.activeReactions.map((rx) => (
            <div
              key={rx.id}
              className="absolute bottom-24 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-white/20 shadow-2xl backdrop-blur-md"
              style={{
                left: `${rx.xOffsetPercent}%`,
                animation: 'floatUp 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              }}
            >
              <Avatar url={rx.senderAvatar} name={rx.senderName} size={24} />
              <span className="text-[11px] font-bold text-white max-w-[90px] truncate">
                {rx.senderName}
              </span>
              <span className="text-xl ml-0.5">{rx.emoji}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top Bar (Requirement 4: Show ONLY Back, title "JTEC Party" and 36px avatar circle) */}
      <header className="h-14 border-b border-white/10 px-3 flex items-center justify-between shrink-0 bg-slate-950/90 backdrop-blur-md z-30">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to Settings"
          className="h-11 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="min-w-0 text-center">
          <h1 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
            {partyState.roomCode ? `Room ${partyState.roomCode}` : 'JTEC Party'}
          </h1>
        </div>

        {partyState.roomCode ? (
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback();
              setShowLeaveConfirm(true);
            }}
            aria-label={partyState.role === 'host' ? 'End party' : 'Leave party'}
            className="h-11 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-xs active:scale-95 transition flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{partyState.role === 'host' ? 'End' : 'Leave'}</span>
          </button>
        ) : profile ? (
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback();
              setLobbyTab('profile');
            }}
            aria-label="Open Profile"
            className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer active:scale-95 transition"
          >
            <Avatar
              url={profile.avatarUrl}
              name={profile.username}
              size={36}
              className="border border-cyan-400/50"
            />
          </button>
        ) : (
          <div className="w-11 min-w-[44px]" />
        )}
      </header>

      {/* Main Scrollable Viewport (Requirement 5: safe padding, min 44px touch targets) */}
      <main className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0 px-3 sm:px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-4 pb-32">
          {/* Status or Error Banner */}
          {(partyState.errorMessage || localError || socialActionMsg) && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
                socialActionMsg?.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {socialActionMsg?.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="truncate">
                  {socialActionMsg?.text || partyState.errorMessage || localError}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  setSocialActionMsg(null);
                  PartyService.clearErrorMessage();
                }}
                className="text-[11px] font-bold text-slate-300 hover:text-white px-2 py-0.5 rounded cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Synchronized 3-2-1 Countdown Overlay */}
          {partyState.playbackStatus === 'countdown' && partyState.countdownNumber !== null && (
            <div className="p-8 rounded-3xl bg-gradient-to-b from-cyan-950/80 to-purple-950/90 border border-cyan-400/50 shadow-2xl text-center space-y-3 animate-pulse">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                Starting together in
              </p>
              <div className="text-7xl sm:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400">
                {partyState.countdownNumber}
              </div>
              <p className="text-xs text-slate-300">Synchronizing audio clocks...</p>
            </div>
          )}

          {/* =========================================================================
              CASE 1: CREATE ACCOUNT SCREEN (If user has no profile yet)
          ========================================================================= */}
          {!profile && !isLoadingProfile && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-950/40 via-purple-950/30 to-slate-900/80 border border-cyan-500/30 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
                    <Radio className="w-6 h-6 text-cyan-400 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-wide">Join JTEC Party</h2>
                    <p className="text-xs text-slate-300">Listen together with friends in perfect sync.</p>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Choose a username to get your 8-character Party ID. No streaming audio between phones—everyone plays their own local copy in harmony.
                </p>

                {/* Profile Creation Form */}
                <form onSubmit={handleCreateProfile} className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white uppercase tracking-wider">
                      Your Username
                    </label>
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={newUsernameInput || 'User'}
                        size={40}
                        className="shadow-md"
                      />
                      <input
                        type="text"
                        maxLength={20}
                        value={newUsernameInput}
                        onChange={(e) => {
                          setNewUsernameInput(e.target.value);
                          setProfileError(null);
                        }}
                        placeholder="e.g. Johnny Tech"
                        className="flex-1 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-950/80 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition"
                      />
                    </div>
                  </div>

                  {profileError && (
                    <p className="text-xs text-rose-400 font-medium">{profileError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingProfile || newUsernameInput.trim().length < 2}
                    className="w-full min-h-[44px] py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-98 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCreatingProfile ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Party Profile...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Create Party Profile</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Privacy Guarantee Message */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed">
                  <Shield className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <p>
                    JTEC Party profiles contain a username, an ID and an optional picture. They are only used for JTEC Party, and you can delete your profile at any time.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              CASE 2: NOT IN ROOM LOBBY (When profile exists & not inside an active room)
          ========================================================================= */}
          {profile && !partyState.roomCode && (
            <div className="space-y-4 animate-in fade-in">
              {/* Tab Selector: Rooms | Friends | Profile */}
              <div className="flex items-center p-1 bg-slate-900/80 border border-white/10 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setLobbyTab('rooms')}
                  className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    lobbyTab === 'rooms'
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Rooms</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLobbyTab('friends')}
                  className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 rounded-xl text-xs font-bold transition cursor-pointer relative ${
                    lobbyTab === 'friends'
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Friends</span>
                  {friendRequests.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLobbyTab('profile')}
                  className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    lobbyTab === 'profile'
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Profile</span>
                </button>
              </div>

              {/* -------------------------------------------------------------------
                  TAB A: ROOMS
              ------------------------------------------------------------------- */}
              {lobbyTab === 'rooms' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Incoming Pending Invites Section */}
                  {pendingInvites.length > 0 && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/60 to-cyan-950/60 border border-cyan-500/30 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                          Party Invitations ({pendingInvites.length})
                        </h4>
                      </div>

                      <div className="space-y-2">
                        {pendingInvites.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-white/10 gap-2 flex-wrap"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar url={inv.from.avatarUrl} name={inv.from.username} size={36} />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {inv.from.username}
                                </p>
                                <p className="text-[11px] text-cyan-300 font-mono">
                                  Room {inv.roomCode}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAcceptInvite(inv)}
                                className="px-3 py-1.5 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold active:scale-95 transition cursor-pointer"
                              >
                                Join
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeclineInvite(inv.id)}
                                className="px-2.5 py-1.5 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Create Room Button */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">Host a Party</h4>
                      <p className="text-xs text-slate-400">
                        Create a room and control the music for your group.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={handleCreateRoom}
                      className="w-full min-h-[44px] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-98 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Creating room...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>Create Room</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Join Room Box (Requirement 5: Join button stays inside card, flex-1 input, fixed width button) */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">Join a Friend&apos;s Party</h4>
                      <p className="text-xs text-slate-400">Enter the 6-character room code from the host.</p>
                    </div>

                    <div className="flex flex-row items-center gap-2 w-full">
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="JT...."
                        aria-label="Enter 6-character room code"
                        className="flex-1 min-w-0 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-950/80 border border-white/10 text-white placeholder-slate-600 text-base font-mono tracking-widest uppercase text-center focus:outline-none focus:border-cyan-400 transition"
                      />
                      <button
                        type="button"
                        disabled={isJoining || joinCodeInput.trim().length !== 6}
                        onClick={() => handleJoinRoom()}
                        className="w-24 shrink-0 min-h-[44px] px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer active:scale-95 shadow-md shadow-cyan-500/10 flex items-center justify-center gap-1.5"
                      >
                        {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Join</span>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------
                  TAB B: FRIENDS
              ------------------------------------------------------------------- */}
              {lobbyTab === 'friends' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Friends Sub-tab Navigator */}
                  <div className="flex border-b border-white/10 pb-1 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setFriendsSubTab('friends')}
                      className={`pb-2 px-3 min-h-[44px] font-bold transition border-b-2 -mb-1 flex items-center ${
                        friendsSubTab === 'friends'
                          ? 'border-cyan-400 text-cyan-300'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Friends ({friends.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFriendsSubTab('requests')}
                      className={`pb-2 px-3 min-h-[44px] font-bold transition border-b-2 -mb-1 flex items-center gap-1.5 ${
                        friendsSubTab === 'requests'
                          ? 'border-cyan-400 text-cyan-300'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>Requests</span>
                      {friendRequests.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[10px]">
                          {friendRequests.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFriendsSubTab('blocked')}
                      className={`pb-2 px-3 min-h-[44px] font-bold transition border-b-2 -mb-1 flex items-center ${
                        friendsSubTab === 'blocked'
                          ? 'border-cyan-400 text-cyan-300'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Blocked ({blockedUsers.length})
                    </button>
                  </div>

                  {/* Add Friend Form (Requirement 5: input on its own line, buttons on second row) */}
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
                    <label className="text-xs font-bold text-white uppercase tracking-wider block">
                      Add Friend by ID
                    </label>

                    <form onSubmit={handleAddFriend} className="flex flex-col gap-2.5 w-full">
                      <input
                        type="text"
                        maxLength={8}
                        value={addFriendInput}
                        onChange={(e) => setAddFriendInput(e.target.value.toUpperCase())}
                        placeholder="Enter 8-character ID (e.g. K7M2Q9XA)"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-cyan-400 transition"
                      />

                      <div className="flex flex-row items-center gap-2 w-full">
                        <button
                          type="submit"
                          disabled={isAddingFriend || !addFriendInput.trim()}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          {isAddingFriend ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="w-3.5 h-3.5" />
                          )}
                          <span>Add</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleShareMyId}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Share My ID</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* SubTab 1: Friends List */}
                  {friendsSubTab === 'friends' && (
                    <div className="space-y-2">
                      {friends.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 text-center space-y-2">
                          <Users className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="text-xs text-slate-400 font-medium">No friends added yet.</p>
                          <p className="text-[11px] text-slate-500">
                            Add a friend above using their 8-character Party ID.
                          </p>
                        </div>
                      ) : (
                        friends.map((friend) => {
                          const presence = presenceMap[friend.id] || { isOnline: true, lastSeen: Date.now() };
                          return (
                            <div
                              key={friend.id}
                              className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-white/10 transition min-h-[52px]"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar url={friend.avatarUrl} name={friend.username} size={40} />
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-white truncate block">
                                    {friend.username}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        presence.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                                      }`}
                                    />
                                    <span className="text-slate-400">
                                      {presence.isOnline ? 'Online now' : `Last seen ${formatLastSeen(presence.lastSeen)}`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFriend(friend)}
                                  className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
                                  title="Remove Friend"
                                >
                                  <UserMinus className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBlockUser(friend)}
                                  className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition flex items-center justify-center cursor-pointer"
                                  title="Block User"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* SubTab 2: Requests List */}
                  {friendsSubTab === 'requests' && (
                    <div className="space-y-2">
                      {friendRequests.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 text-center">
                          <p className="text-xs text-slate-400 font-medium">No pending friend requests.</p>
                        </div>
                      ) : (
                        friendRequests.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-white/5 gap-2 flex-wrap"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar url={req.from.avatarUrl} name={req.from.username} size={36} />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-white truncate block">
                                  {req.from.username}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAcceptFriendRequest(req.id)}
                                className="px-3 py-1.5 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition active:scale-95 cursor-pointer"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeclineFriendRequest(req.id)}
                                className="px-2.5 py-1.5 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* SubTab 3: Blocked Users */}
                  {friendsSubTab === 'blocked' && (
                    <div className="space-y-2">
                      {blockedUsers.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 text-center">
                          <p className="text-xs text-slate-400 font-medium">No blocked users.</p>
                        </div>
                      ) : (
                        blockedUsers.map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-white/5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar url={b.avatarUrl} name={b.username} size={36} />
                              <span className="text-xs font-bold text-white truncate block">
                                {b.username}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUnblockUser(b)}
                              className="px-3 py-1.5 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                            >
                              Unblock
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* -------------------------------------------------------------------
                  TAB C: PROFILE
              ------------------------------------------------------------------- */}
              {lobbyTab === 'profile' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-5 text-center">
                    {/* Avatar with Camera Trigger */}
                    <div className="relative w-24 h-24 mx-auto">
                      <Avatar
                        url={profile.avatarUrl}
                        name={profile.username}
                        size={96}
                        className="border-2 border-cyan-400/50 shadow-xl"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingPhoto}
                        aria-label="Change Profile Photo"
                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer"
                        title="Upload & Change Picture"
                      >
                        {isProcessingPhoto ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Username Edit */}
                    <div className="space-y-2">
                      {isEditingUsername ? (
                        <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                          <input
                            type="text"
                            maxLength={20}
                            value={editUsernameVal}
                            onChange={(e) => setEditUsernameVal(e.target.value)}
                            className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-slate-950 border border-white/20 text-white text-sm text-center focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            disabled={isSavingUsername}
                            onClick={handleSaveUsername}
                            className="min-h-[44px] px-3 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingUsername(false)}
                            className="min-h-[44px] px-3 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <h3 className="text-lg font-bold text-white">{profile.username}</h3>
                          <button
                            type="button"
                            onClick={() => {
                              setEditUsernameVal(profile.username);
                              setIsEditingUsername(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white transition"
                            title="Edit username"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Requirement 2: Monospace ID with Copy and Share */}
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1 w-full max-w-sm mx-auto">
                        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 w-full sm:w-auto">
                          <span className="font-mono text-cyan-300 font-bold text-sm tracking-widest select-all">
                            ID: {profile.id}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyMyId}
                            aria-label="Copy Party ID"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                            title="Copy Party ID"
                          >
                            {copiedMyId ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-cyan-400" />
                            )}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleShareMyId}
                          aria-label="Share Party ID"
                          className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Share2 className="w-4 h-4 text-cyan-400" />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Share your Party ID with friends so they can add you.
                    </p>

                    {/* Danger Zone: Delete Account */}
                    <div className="pt-4 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setShowDeleteAccountConfirm(true)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
                      >
                        Delete My Account
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              CASE 3: ACTIVE ROOM VIEW (Strict top-to-bottom layout, no overlap)
          ========================================================================= */}
          {partyState.roomCode && (
            <div className="space-y-4">
              {/* 1. ROOM CODE CARD */}
              <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/80 border border-cyan-500/30 shadow-2xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider block">
                      Party Room
                    </span>
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-white mt-0.5">
                      {partyState.roomCode}
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        partyState.role === 'host'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                      }`}
                    >
                      {partyState.role === 'host' ? <Crown className="w-3.5 h-3.5" /> : null}
                      <span>{partyState.role === 'host' ? 'Host' : 'Guest'}</span>
                    </span>
                  </div>
                </div>

                {/* Buttons row: Copy, Share, Invite */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    aria-label="Copy room code to clipboard"
                    className="flex-1 min-w-[90px] min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleShareRoom}
                    aria-label="Share room code"
                    className="flex-1 min-w-[90px] min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Share</span>
                  </button>

                  {partyState.role === 'host' && (
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      aria-label="Invite friends"
                      className="flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-purple-300" />
                      <span>Invite Friends</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 2. NOW PLAYING CARD */}
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-cyan-950/40 via-purple-950/30 to-slate-900/90 border border-white/10 shadow-2xl space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Now Playing in Party</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      partyState.playbackStatus === 'playing'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : partyState.playbackStatus === 'loading'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-400 border border-white/5'
                    }`}
                  >
                    {partyState.playbackStatus.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950/80 border border-white/10 overflow-hidden shrink-0 shadow-lg relative flex items-center justify-center">
                    {partyState.currentTrack?.cover ? (
                      <img
                        src={partyState.currentTrack.cover}
                        alt="Track cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-8 h-8 text-cyan-400/50" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-white truncate">
                      {partyState.currentTrack?.title || 'Waiting for host to pick a track...'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 truncate mt-0.5">
                      {partyState.currentTrack?.artist || 'Synced listening'}
                    </p>
                  </div>
                </div>

                {/* Read-Only Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="h-2 w-full rounded-full bg-slate-950/80 overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300"
                      style={{
                        width: `${
                          partyState.currentTrack?.duration
                            ? Math.min(100, (currentPlaybackSec / partyState.currentTrack.duration) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatSeconds(currentPlaybackSec)}</span>
                    <span>
                      {partyState.currentTrack?.duration
                        ? formatSeconds(partyState.currentTrack.duration)
                        : '--:--'}
                    </span>
                  </div>
                </div>

                {/* Vote to Skip Row & Controls */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 flex-wrap">
                  <div className="flex items-center gap-2">
                    {partyState.role === 'guest' && (
                      <button
                        type="button"
                        disabled={hasSelfVotedSkip || !partyState.currentTrack}
                        onClick={() => PartyService.voteToSkip()}
                        className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          hasSelfVotedSkip
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10'
                        }`}
                      >
                        <SkipForward className="w-3.5 h-3.5 text-purple-400" />
                        <span>{hasSelfVotedSkip ? 'Vote Recorded' : 'Vote Skip'}</span>
                      </button>
                    )}

                    {skipVotesCount > 0 && (
                      <span className="text-xs text-slate-300 font-medium">
                        {skipVotesCount} of {totalMembers} want to skip
                      </span>
                    )}
                  </div>

                  {partyState.role === 'host' && (
                    <button
                      type="button"
                      onClick={() => PartyService.hostSkipTrack()}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        isMajoritySkip
                          ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white animate-pulse shadow-lg'
                          : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10'
                      }`}
                    >
                      <SkipForward className="w-3.5 h-3.5 text-white" />
                      <span>Skip Song</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. REACTION BAR */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {PARTY_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => PartyService.sendReaction(emoji)}
                      className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-slate-800/80 hover:bg-slate-700 text-lg flex items-center justify-center active:scale-90 transition cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => PartyService.toggleMuteReactions()}
                  className={`min-h-[44px] min-w-[44px] p-2.5 rounded-xl transition cursor-pointer flex items-center justify-center ${
                    partyState.isReactionsMuted
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title={partyState.isReactionsMuted ? 'Unmute reactions' : 'Mute reactions'}
                >
                  {partyState.isReactionsMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
              </div>

              {/* 4. QUEUE LIST (For Host) */}
              {partyState.role === 'host' && (
                <div className="p-4 rounded-3xl bg-slate-900/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListMusic className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                        Host Queue ({partyState.queue.length})
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddSongsModal(true)}
                      className="min-h-[44px] px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs text-cyan-300 font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Songs</span>
                    </button>
                  </div>

                  {partyState.queue.length === 0 ? (
                    <p className="text-xs text-slate-400">Queue is empty. Tap &quot;Add Songs&quot; to pick downloaded cloud tracks.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {partyState.queue.map((track, idx) => (
                        <div
                          key={`${track.id}-${idx}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/5 text-xs"
                        >
                          <div className="min-w-0 flex-1 truncate pr-2">
                            <span className="font-semibold text-white">{track.title}</span>
                            <span className="text-slate-400 ml-1.5">— {track.artist}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => PartyService.hostRemoveFromQueue(idx)}
                            className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-rose-400 transition flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. MEMBERS LIST (Requirement 3: shared Avatar component) */}
              <div className="p-4 rounded-3xl bg-slate-900/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Listeners in Room ({partyState.members.length}/8)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {readyMembersCount} synced
                  </span>
                </div>

                <div className="space-y-2">
                  {partyState.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/5 text-xs min-h-[48px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          url={member.avatar?.startsWith('data:') ? member.avatar : null}
                          name={member.nickname}
                          size={36}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white truncate">{member.nickname}</span>
                            {member.isHost && (
                              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2">
                            <span>Status: {member.status}</span>
                            {member.latencyMs !== undefined && (
                              <span className="font-mono text-cyan-300">
                                {member.latencyMs}ms ping
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {partyState.role === 'host' && !member.isHost && (
                        <button
                          type="button"
                          onClick={() => handleKickMember(member)}
                          className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-rose-400 transition flex items-center justify-center cursor-pointer"
                          title="Remove from room"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =========================================================================
          ADD SONGS MODAL (Requirement 6: downloaded cloud songs selectable; local songs greyed out with reason)
      ========================================================================= */}
      {showAddSongsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-cyan-500/30 p-5 space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Add Songs from Library</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSongsModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 shrink-0 leading-relaxed">
              Downloaded cloud songs can be synchronized with party members. Local device audio cannot be shared.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {songs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <p>No songs found in Library.</p>
                  {onNavigateToCloud && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddSongsModal(false);
                        onNavigateToCloud();
                      }}
                      className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
                    >
                      Browse Cloud Catalog
                    </button>
                  )}
                </div>
              ) : (
                songs.map((song) => {
                  const isCloudTrack = Boolean(song.isCloud);
                  return (
                    <div
                      key={song.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition min-h-[56px] ${
                        isCloudTrack
                          ? 'bg-slate-950/80 border-white/10 hover:border-cyan-500/40'
                          : 'bg-slate-950/30 border-white/5 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <img
                          src={song.artworkUrl || './pwa-192x192.png'}
                          alt={song.title}
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{song.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                          {!isCloudTrack && (
                            <span className="text-[10px] text-amber-300/90 font-medium block mt-0.5">
                              Local file — party sync requires downloaded cloud song
                            </span>
                          )}
                        </div>
                      </div>

                      {isCloudTrack ? (
                        <button
                          type="button"
                          onClick={() => handleAddSongToParty(song)}
                          className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shrink-0 cursor-pointer active:scale-95 transition"
                        >
                          Add to Party
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 px-2 py-1 bg-slate-800/40 rounded-lg shrink-0">
                          Unavailable
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowAddSongsModal(false)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave / End Party Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-rose-500/40 p-5 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-white">
              {partyState.role === 'host' ? 'End Party for Everyone?' : 'Leave this Party?'}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {partyState.role === 'host'
                ? 'Ending the party closes the room for all connected listeners and restores their individual player settings.'
                : 'Leaving will disconnect you from synchronous listening and restore your sound settings.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveOrEnd}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                {partyState.role === 'host' ? 'End Party' : 'Leave Party'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-rose-500/40 p-5 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Delete JTEC Party Account?</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                This will delete your party profile, friends list, and invitations from this device. You can create a new profile at any time.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteAccountConfirm(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
              >
                {isDeletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Friends Modal (Inside active room - Requirement 3: shared Avatar) */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-purple-500/30 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">Invite Friends</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="min-h-[44px] min-w-[44px] text-xs text-slate-400 hover:text-white flex items-center justify-center"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Invite your friends to room{' '}
              <strong className="text-white font-mono">{partyState.roomCode}</strong>:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {friends.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No friends added yet.</p>
              ) : (
                friends.map((friend) => {
                  const isInvited = invitedFriendIds.has(friend.id);
                  const presence = presenceMap[friend.id] || { isOnline: true, lastSeen: Date.now() };
                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/5 min-h-[48px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar url={friend.avatarUrl} name={friend.username} size={36} />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-white truncate block">
                            {friend.username}
                          </span>
                          <div className="flex items-center gap-1 text-[10px]">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                presence.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                              }`}
                            />
                            <span className="text-slate-400">
                              {presence.isOnline ? 'Online now' : 'Offline'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isInvited}
                        onClick={() => handleInviteFriendToRoom(friend.id)}
                        className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          isInvited
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                      >
                        {isInvited ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Invited</span>
                          </>
                        ) : (
                          <span>Invite</span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
