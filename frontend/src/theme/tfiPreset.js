// Custom PrimeVue preset — light AND dark mode, Bosch Rexroth palette.
//
// Both colour schemes use ONLY the six Rexroth base colours (the
// --rexroth-1..6 tokens in style.css) plus white, and tints made by mixing
// them with each other. Dark mode:
//
//   navy   #002B49  page / sidebar / topbar / inputs
//   slate  #506E81  mixed into navy to make the card / panel / hover
//                   layers (no extra hue is introduced)
//   steel  #A3BAC8  secondary text, muted icons
//   cyan   #00C8F7  primary accent (buttons, values, active items)
//   ice    #91F0FF  secondary accent (hover, second series)
//   red    #ED0007  danger / alarm — fills and borders only, because red
//                   text on navy is only ~2.7:1
//
// Why a preset at all: PrimeVue's own components (Card, DataTable, Dialog,
// Select, inputs, Button severities, Toast…) do not read our CSS variables;
// they use Aura's token system, whose dark defaults are a zinc/black scale
// plus green/orange/purple severities. definePreset deep-merges, so only
// the `light` and `dark` colour schemes are touched.
// Keep these values in sync with `:root` / `.p-dark` in style.css.
//
// Light mode: white / steel-tinted surfaces (white ← steel 12 / 25 / 45 %),
// navy text and navy primary buttons, slate secondary text, cyan / ice as
// accents, red for alarms only.
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

const rx = {
  navy: '#002B49',
  slate: '#506E81',
  steel: '#A3BAC8',
  cyan: '#00C8F7',
  ice: '#91F0FF',
  red: '#ED0007',
  white: '#FFFFFF'
}

// navy ← slate mixes (percent of slate): 18 / 24 / 30 / 36 / 55
const dm = {
  bgMain: rx.navy,
  bgCard: '#0E3753',
  bgCardAlt: '#133B56',
  bgPanel: '#183F5A',
  bgHover: '#1D435D',
  border: '#2C5068',
  borderHover: rx.slate,
  textPrimary: rx.white,
  textSecondary: rx.steel,
  iconMuted: '#829CAC' // steel ← slate 40 %
}

// One filled-button variant: background, hover, text colour.
const filled = (bg, hover, fg) => ({
  background: bg,
  hoverBackground: hover,
  activeBackground: hover,
  borderColor: bg,
  hoverBorderColor: hover,
  activeBorderColor: hover,
  color: fg,
  hoverColor: fg,
  activeColor: fg,
  focusRing: { color: bg, shadow: 'none' }
})
const outlined = (c, border) => ({
  hoverBackground: `color-mix(in srgb, ${c}, transparent 90%)`,
  activeBackground: `color-mix(in srgb, ${c}, transparent 80%)`,
  borderColor: border,
  color: c
})
const textBtn = (c) => ({
  hoverBackground: `color-mix(in srgb, ${c}, transparent 88%)`,
  activeBackground: `color-mix(in srgb, ${c}, transparent 78%)`,
  color: c
})

// severity → palette colour (filled / outlined / text variants)
const sev = {
  primary: { c: rx.cyan, h: rx.ice, fg: rx.navy },
  success: { c: rx.ice, h: rx.white, fg: rx.navy },
  info: { c: rx.ice, h: rx.white, fg: rx.navy },
  help: { c: rx.steel, h: rx.white, fg: rx.navy },
  warn: { c: rx.steel, h: rx.white, fg: rx.navy },
  danger: { c: rx.red, h: '#FF3A40', fg: rx.white }
}

const buttonDark = {
  root: {
    primary: filled(sev.primary.c, sev.primary.h, sev.primary.fg),
    success: filled(sev.success.c, sev.success.h, sev.success.fg),
    info: filled(sev.info.c, sev.info.h, sev.info.fg),
    help: filled(sev.help.c, sev.help.h, sev.help.fg),
    warn: filled(sev.warn.c, sev.warn.h, sev.warn.fg),
    danger: filled(sev.danger.c, sev.danger.h, sev.danger.fg),
    secondary: filled(rx.slate, '#5F7D90', rx.white),
    contrast: filled(rx.white, rx.ice, rx.navy)
  },
  outlined: {
    primary: outlined(rx.cyan, rx.cyan),
    secondary: outlined(rx.steel, rx.slate),
    success: outlined(rx.ice, rx.ice),
    info: outlined(rx.ice, rx.ice),
    help: outlined(rx.steel, rx.steel),
    warn: outlined(rx.steel, rx.steel),
    danger: outlined(rx.red, rx.red)
  },
  text: {
    primary: textBtn(rx.cyan),
    secondary: textBtn(rx.steel),
    success: textBtn(rx.ice),
    info: textBtn(rx.ice),
    help: textBtn(rx.steel),
    warn: textBtn(rx.steel),
    danger: textBtn(rx.red)
  }
}

// Toast / Message: neutral panel, severity shown by the border colour.
const toastSev = (border) => ({
  background: dm.bgPanel,
  borderColor: border,
  color: rx.white,
  detailColor: rx.steel,
  shadow: '0px 6px 16px 0px rgba(0, 20, 36, 0.5)',
  closeButton: { hoverBackground: 'rgba(255, 255, 255, 0.08)', focusRing: { color: border, shadow: 'none' } }
})

// Tag: tinted background + readable text.
const tagSev = (c, fg) => ({ background: `color-mix(in srgb, ${c}, transparent 82%)`, color: fg })

// ---------- light scheme ----------
const lm = {
  bgPage: '#D6E0E6', // white ← steel 45 %
  bgCard: '#F4F7F8', // white ← steel 12 %
  bgAlt: '#E8EEF1', // white ← steel 25 %
  border: rx.steel,
  inputBorder: '#88A1B1', // steel ← slate 33 %
  textPrimary: rx.navy,
  textSecondary: '#3C5D73', // slate ← navy 25 %
  iconMuted: '#6C8899', // steel ← slate 66 %
  redDark: '#BE090F' // red ← navy 20 %, red text on white (6:1)
}

const sevLight = {
  primary: filled(rx.navy, '#3C5D73', rx.white),
  secondary: filled('#BACBD6', rx.steel, rx.navy), // visible on both the page (#D6E0E6) and cards (#F4F7F8)
  success: filled(rx.cyan, rx.ice, rx.navy),
  info: filled(rx.ice, '#B8F6FF', rx.navy),
  help: filled(rx.steel, '#BACBD6', rx.navy),
  warn: filled(rx.slate, '#3C5D73', rx.white),
  danger: filled(rx.red, lm.redDark, rx.white),
  contrast: filled(rx.navy, '#3C5D73', rx.white)
}
const buttonLight = {
  root: sevLight,
  outlined: {
    primary: outlined(rx.navy, rx.navy),
    secondary: outlined(rx.slate, rx.steel),
    success: outlined('#007AA0', '#007AA0'), // navy ← cyan 50 %
    info: outlined('#007AA0', '#007AA0'),
    help: outlined(rx.slate, rx.steel),
    warn: outlined(rx.slate, rx.slate),
    danger: outlined(rx.red, rx.red)
  },
  text: {
    primary: textBtn(rx.navy),
    secondary: textBtn(rx.slate),
    success: textBtn('#007AA0'),
    info: textBtn('#007AA0'),
    help: textBtn(rx.slate),
    warn: textBtn(rx.slate),
    danger: textBtn(rx.red)
  }
}
const toastSevLight = (border) => ({
  background: rx.white,
  borderColor: border,
  color: rx.navy,
  detailColor: lm.textSecondary,
  shadow: '0px 6px 16px 0px rgba(0, 43, 73, 0.18)',
  closeButton: { hoverBackground: 'rgba(0, 43, 73, 0.06)', focusRing: { color: border, shadow: 'none' } }
})
const tagLight = (c, fg) => ({ background: `color-mix(in srgb, ${c}, transparent 78%)`, color: fg })

const lightScheme = {
  primary: { color: rx.navy, contrastColor: rx.white, hoverColor: '#3C5D73', activeColor: '#284C65' },
  surface: {
    0: rx.white,
    50: lm.bgCard,
    100: lm.bgAlt,
    200: lm.bgPage,
    300: '#BACBD6',
    400: rx.steel,
    500: '#88A1B1',
    600: rx.slate,
    700: '#3C5D73',
    800: '#284C65',
    900: '#143C57',
    950: rx.navy
  },
  text: { color: lm.textPrimary, hoverColor: rx.navy, mutedColor: lm.textSecondary, hoverMutedColor: rx.navy },
  content: {
    background: lm.bgCard,
    hoverBackground: lm.bgAlt,
    borderColor: lm.border,
    color: '{text.color}',
    hoverColor: '{text.hover.color}'
  },
  overlay: {
    select: { background: rx.white, borderColor: lm.border, color: '{text.color}' },
    popover: { background: rx.white, borderColor: lm.border, color: '{text.color}' },
    modal: { background: rx.white, borderColor: lm.border, color: '{text.color}' }
  },
  formField: {
    background: rx.white,
    disabledBackground: lm.bgAlt,
    filledBackground: lm.bgAlt,
    filledHoverBackground: lm.bgAlt,
    filledFocusBackground: rx.white,
    borderColor: lm.inputBorder,
    hoverBorderColor: rx.slate,
    focusBorderColor: rx.navy,
    color: lm.textPrimary,
    disabledColor: lm.iconMuted,
    placeholderColor: lm.iconMuted,
    iconColor: rx.slate,
    floatLabelColor: lm.iconMuted,
    floatLabelActiveColor: lm.iconMuted
  },
  highlight: {
    background: 'color-mix(in srgb, #00C8F7, transparent 78%)',
    focusBackground: 'color-mix(in srgb, #00C8F7, transparent 66%)',
    color: rx.navy,
    focusColor: rx.navy
  },
  list: {
    option: {
      focusBackground: lm.bgAlt,
      selectedBackground: '{highlight.background}',
      selectedFocusBackground: '{highlight.focus.background}',
      color: '{text.color}',
      focusColor: '{text.hover.color}',
      selectedColor: '{highlight.color}',
      selectedFocusColor: '{highlight.focus.color}',
      icon: { color: lm.iconMuted, focusColor: rx.slate }
    },
    optionGroup: { background: 'transparent', color: '{text.muted.color}' }
  },
  navigation: {
    item: {
      focusBackground: lm.bgAlt,
      activeBackground: lm.bgAlt,
      color: '{text.color}',
      focusColor: '{text.hover.color}',
      activeColor: '{text.hover.color}',
      icon: { color: lm.iconMuted, focusColor: rx.slate, activeColor: rx.slate }
    },
    submenuLabel: { background: 'transparent', color: '{text.muted.color}' },
    submenuIcon: { color: lm.iconMuted, focusColor: rx.slate, activeColor: rx.slate }
  }
}

export const TFIPreset = definePreset(Aura, {
  semantic: {
    colorScheme: {
      light: lightScheme,
      dark: {
        // Primary accent = Rexroth cyan. contrastColor is the text colour
        // used on top of it (navy, 7.4:1).
        primary: {
          color: rx.cyan,
          contrastColor: rx.navy,
          hoverColor: rx.ice,
          activeColor: rx.ice
        },
        // Fallback scale for any component not overridden below,
        // monotonically darker from 0 (white) to 950 (navy).
        surface: {
          0: rx.white,
          50: '#E3EDF2',
          100: '#CBDBE4',
          200: rx.steel,
          300: dm.iconMuted,
          400: '#6A889B',
          500: rx.slate,
          600: '#3F6077',
          700: dm.border,
          800: dm.bgPanel,
          900: dm.bgCard,
          950: dm.bgMain
        },
        text: {
          color: dm.textPrimary,
          hoverColor: rx.white,
          mutedColor: dm.textSecondary,
          hoverMutedColor: rx.white
        },
        // Card, DataTable body, Panel, Fieldset…
        content: {
          background: dm.bgCard,
          hoverBackground: dm.bgHover,
          borderColor: dm.border,
          color: '{text.color}',
          hoverColor: '{text.hover.color}'
        },
        // Dialog, Select panel, Popover, ContextMenu
        overlay: {
          select: { background: dm.bgPanel, borderColor: dm.border, color: '{text.color}' },
          popover: { background: dm.bgPanel, borderColor: dm.border, color: '{text.color}' },
          modal: { background: dm.bgPanel, borderColor: dm.border, color: '{text.color}' }
        },
        // Inputs sit recessed (navy) inside the lighter cards.
        formField: {
          background: dm.bgMain,
          disabledBackground: dm.bgHover,
          filledBackground: dm.bgCardAlt,
          filledHoverBackground: dm.bgCardAlt,
          filledFocusBackground: dm.bgCardAlt,
          borderColor: dm.border,
          hoverBorderColor: dm.borderHover,
          focusBorderColor: rx.cyan,
          color: dm.textPrimary,
          disabledColor: dm.iconMuted,
          placeholderColor: dm.iconMuted,
          iconColor: dm.iconMuted,
          floatLabelColor: dm.iconMuted,
          floatLabelActiveColor: dm.iconMuted
        },
        // Selected row / option tint
        highlight: {
          background: 'color-mix(in srgb, #00C8F7, transparent 80%)',
          focusBackground: 'color-mix(in srgb, #00C8F7, transparent 70%)',
          color: rx.white,
          focusColor: rx.white
        },
        list: {
          option: {
            focusBackground: dm.bgHover,
            selectedBackground: '{highlight.background}',
            selectedFocusBackground: '{highlight.focus.background}',
            color: '{text.color}',
            focusColor: '{text.hover.color}',
            selectedColor: '{highlight.color}',
            selectedFocusColor: '{highlight.focus.color}',
            icon: { color: dm.iconMuted, focusColor: rx.steel }
          },
          optionGroup: { background: 'transparent', color: '{text.muted.color}' }
        },
        navigation: {
          item: {
            focusBackground: dm.bgHover,
            activeBackground: dm.bgHover,
            color: '{text.color}',
            focusColor: '{text.hover.color}',
            activeColor: '{text.hover.color}',
            icon: { color: dm.iconMuted, focusColor: rx.steel, activeColor: rx.steel }
          },
          submenuLabel: { background: 'transparent', color: '{text.muted.color}' },
          submenuIcon: { color: dm.iconMuted, focusColor: rx.steel, activeColor: rx.steel }
        }
      }
    }
  },
  components: {
    button: { colorScheme: { light: buttonLight, dark: buttonDark } },
    toast: {
      colorScheme: {
        light: {
          info: toastSevLight('#007AA0'),
          success: toastSevLight(rx.cyan),
          warn: toastSevLight(rx.slate),
          error: toastSevLight(rx.red),
          secondary: toastSevLight(rx.steel),
          contrast: toastSevLight(rx.navy)
        },
        dark: {
          info: toastSev(rx.ice),
          success: toastSev(rx.cyan),
          warn: toastSev(rx.steel),
          error: toastSev(rx.red),
          secondary: toastSev(rx.slate),
          contrast: toastSev(rx.white)
        }
      }
    },
    tag: {
      colorScheme: {
        light: {
          primary: tagLight(rx.navy, rx.navy),
          success: tagLight(rx.cyan, rx.navy),
          info: tagLight(rx.ice, rx.navy),
          warn: tagLight(rx.slate, '#284C65'),
          danger: tagLight(rx.red, lm.redDark),
          secondary: { background: lm.bgAlt, color: lm.textSecondary }
        },
        dark: {
          primary: tagSev(rx.cyan, rx.cyan),
          success: tagSev(rx.cyan, rx.cyan),
          info: tagSev(rx.ice, rx.ice),
          warn: tagSev(rx.steel, rx.steel),
          danger: tagSev(rx.red, '#FF6A6E'),
          secondary: { background: dm.bgPanel, color: rx.steel }
        }
      }
    }
  }
})
