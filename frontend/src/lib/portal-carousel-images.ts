/**
 * Three separate slideshows under `/public/images/portal-carousel/{landing|login|register}/01.png` … `06.png`.
 * Landing, login, and registration pages use different sets so images never repeat across those routes.
 * Alt text describes Indian people and Indian healthcare settings.
 */

export type PortalCarouselPage = "landing" | "login" | "register";

export const LANDING_CAROUSEL_ITEMS = [
  {
    file: "01.png",
    alt: "Modern Indian multispecialty hospital building exterior with people arriving, daytime",
  },
  {
    file: "02.png",
    alt: "Indian doctors and nurses walking together in a bright hospital corridor in India",
  },
  {
    file: "03.png",
    alt: "Indian medical team discussing care at a hospital nurses station with monitors",
  },
  {
    file: "04.png",
    alt: "Indian patient with family seated in a hospital waiting area, calm supportive mood",
  },
  {
    file: "05.png",
    alt: "Indian reception staff assisting visitors at a busy clinic front desk",
  },
  {
    file: "06.png",
    alt: "Indian cardiologist reviewing a heart rhythm printout with a patient in a consultation room",
  },
] as const;

export const LOGIN_CAROUSEL_ITEMS = [
  {
    file: "01.png",
    alt: "Indian adult using a laptop at home with a blurred health portal on screen, Indian living room",
  },
  {
    file: "02.png",
    alt: "Indian doctor signing in at a computer workstation in an Indian clinic office",
  },
  {
    file: "03.png",
    alt: "Indian visitor presenting identification at a hospital reception security desk",
  },
  {
    file: "04.png",
    alt: "Indian elderly person on a sofa at home using a smartphone for a health application",
  },
  {
    file: "05.png",
    alt: "Indian nurse entering notes at a computer terminal on a hospital ward in India",
  },
  {
    file: "06.png",
    alt: "Indian office worker briefly checking a wellness notification on a phone during a break",
  },
] as const;

export const REGISTER_CAROUSEL_ITEMS = [
  {
    file: "01.png",
    alt: "Indian new patient at a hospital registration counter with staff helping with paperwork",
  },
  {
    file: "02.png",
    alt: "Indian family supporting an elderly relative at an outpatient registration desk",
  },
  {
    file: "03.png",
    alt: "Indian receptionist helping a young woman complete registration at a clinic in India",
  },
  {
    file: "04.png",
    alt: "Indian mother with a child at a hospital registration window, friendly staff",
  },
  {
    file: "05.png",
    alt: "Indian administrative staff verifying documents with a new patient at a service desk",
  },
  {
    file: "06.png",
    alt: "Indian hospital volunteer guiding a visitor toward the registration area in a lobby",
  },
] as const;

export const PORTAL_CAROUSEL_BY_PAGE: Record<
  PortalCarouselPage,
  readonly { file: string; alt: string }[]
> = {
  landing: LANDING_CAROUSEL_ITEMS,
  login: LOGIN_CAROUSEL_ITEMS,
  register: REGISTER_CAROUSEL_ITEMS,
};
