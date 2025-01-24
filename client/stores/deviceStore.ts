import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DeviceInfo {
    deviceId: string
    label: string
    kind: MediaDeviceKind
}

export const useDeviceStore = defineStore('devices', {
    state: () => ({
        audioInputs: [] as DeviceInfo[],
        audioOutputs: [] as DeviceInfo[],
        videoInputs: [] as DeviceInfo[],

        selectedAudioInput: 'default',
        selectedAudioOutput: 'default',
        selectedVideoInput: 'default'
    }),
    actions: {
        async enumerateDevices() {
            const devices = await navigator.mediaDevices.enumerateDevices()
            this.audioInputs = []
            this.audioOutputs = []
            this.videoInputs = []

            devices.forEach(d => {
                const info: DeviceInfo = {
                    deviceId: d.deviceId,
                    label: d.label || d.kind,
                    kind: d.kind
                }
                if(d.kind === 'audioinput') this.audioInputs.push(info)
                if(d.kind === 'audiooutput') this.audioOutputs.push(info)
                if(d.kind === 'videoinput') this.videoInputs.push(info)
            })
        },
        loadFromStorage() {
            const aIn = localStorage.getItem('selAudioIn')
            const aOut = localStorage.getItem('selAudioOut')
            const vIn = localStorage.getItem('selVideoIn')
            if (aIn) this.selectedAudioInput = aIn
            if (aOut) this.selectedAudioOutput = aOut
            if (vIn) this.selectedVideoInput = vIn
        },
        saveToStorage() {
            localStorage.setItem('selAudioIn', this.selectedAudioInput)
            localStorage.setItem('selAudioOut', this.selectedAudioOutput)
            localStorage.setItem('selVideoIn', this.selectedVideoInput)
        }
    }
})
