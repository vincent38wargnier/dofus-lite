import { useEffect, useMemo } from 'react';
import { useCustomEquipment } from './CustomEquipmentContext';
import { useLoadoutLibrary } from './LoadoutsContext';
import { useProfiles } from './ProfilesContext';
import { collectForgedEquipment, personalEquipmentCollection } from './personalEquipmentStore';

export default function usePersonalEquipment(loadout, sourceKey, name) {
  const custom = useCustomEquipment();
  const library = useLoadoutLibrary();
  const profiles = useProfiles();
  const sources = useMemo(() => [
    { key: `current:${sourceKey}`, name, loadout },
    ...(profiles?.profiles || []).map(profile => ({ key: `profile:${profile.id}`, name: profile.name, loadout: profile.loadout })),
    ...(library?.library.builds || []).map(build => ({ key: `stuff:${build.id}`, name: build.name, loadout: build.loadout })),
    ...Object.entries(library?.saved || {}).map(([key, draft]) => ({ key: `draft:${key}`, name: 'Préparation', loadout: draft })),
  ], [loadout, sourceKey, name, profiles?.profiles, library?.library.builds, library?.saved]);
  const snapshots = useMemo(() => collectForgedEquipment(sources), [sources]);
  const remember = custom?.rememberForged;
  useEffect(() => { remember?.(snapshots); }, [snapshots, remember]);
  const entries = useMemo(() => personalEquipmentCollection(custom?.items || [], sources, custom?.forged || []), [custom?.items, custom?.forged, sources]);
  return { entries, error: custom?.forgeError || custom?.error };
}
