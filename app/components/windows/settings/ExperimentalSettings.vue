<template>
  <div>
    <div class="section">
      <div class="section-content">
        <GenericForm v-model="settingsFormData" @input="saveSettings" />
        <button class="button" @click="repairSceneCollection()">Repair Scene Collection</button>
        <br />
        <br />
        <br />
        <button class="button button--action" @click="showDemoComponents()">
          Show Shared Components Library
        </button>
        <br />
        <br />
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ExperimentalSettings.vue.ts"></script>
