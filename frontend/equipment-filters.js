export function equipmentKey(type, model) {
  return JSON.stringify([String(type ?? '').trim(), String(model ?? '').trim()]);
}

export function matchesEquipment(task, filters = {}) {
  return (!filters.capture_device || filters.capture_device === equipmentKey(task.device_os, task.operational_device_model)) &&
    (!filters.replay_screen || filters.replay_screen === equipmentKey(task.replay_device_type, task.replay_device_model));
}

export function equipmentOptions(tasks) {
  const options = (type, model) => [...new Map(tasks.map(task => {
    const value = equipmentKey(task[type], task[model]);
    return [value, { value, label: [task[type], task[model]].filter(Boolean).join(' · ') || 'Nepoznata oprema' }];
  })).values()];
  return { capture_devices: options('device_os', 'operational_device_model'), replay_screens: options('replay_device_type', 'replay_device_model') };
}
