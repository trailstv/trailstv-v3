/**
 * Campground data kept on TrailsTV (flat files written by `npm run sync:campgrounds`).
 *   content/campgrounds/<park>.json   Campground[]   (NPS campground records, cleaned up)
 *   content/campsites/<id>.json       Campsite[]     (site-by-site details from Recreation.gov RIDB, optional)
 */

export interface CampgroundSeason {
  name: string;
  description: string;
  /** monday…sunday → "All Day" | "Closed" | "8:00AM - 5:00PM" */
  hours: Record<string, string>;
  exceptions: { name: string; start: string; end: string; closed: boolean }[];
}

export interface CampgroundFee { title: string; cost: number | null; description: string }

export interface CampgroundAmenities {
  toilets: string[];
  showers: string[];
  potableWater: string[];
  dumpStation: string;
  laundry: string;
  campStore: string;
  firewood: string;
  ice: string;
  foodStorage: string;
  trash: string;
  amphitheater: string;
  host: string;
  cellReception: string;
  internet: string;
}

export interface CampgroundAccess {
  wheelchair: string;
  adaInfo: string;
  rvAllowed: boolean | null;
  rvMaxLength: number | null;
  rvInfo: string;
  trailerAllowed: boolean | null;
  trailerMaxLength: number | null;
  accessRoads: string[];
  classifications: string[];
  fireStovePolicy: string;
  cellPhoneInfo: string;
  internetInfo: string;
  additionalInfo: string;
}

export interface CampgroundPhoto { url: string; alt: string; title: string; caption: string; credit: string }

export interface Campground {
  /** URL slug, e.g. "yose-upper-pines" */
  id: string;
  npsId: string;
  parkCode: string;
  name: string;
  lat: number | null;
  lon: number | null;
  description: string;
  /** Recreation.gov facility id – only used for the Reserve (payment) link and campsite details. */
  recGovId: string | null;
  reservationUrl: string | null;
  reservationInfo: string;
  sitesReservable: number;
  sitesFirstCome: number;
  sites: { total: number; tentOnly: number; rvOnly: number; electrical: number; group: number; horse: number; walkBoatTo: number; other: number };
  seasons: CampgroundSeason[];
  fees: CampgroundFee[];
  amenities: CampgroundAmenities;
  access: CampgroundAccess;
  directions: string;
  weather: string;
  regulations: string;
  address: { line1: string; city: string; state: string; zip: string } | null;
  phone: string | null;
  email: string | null;
  photos: CampgroundPhoto[];
  /** Number of sites in content/campsites/<id>.json (0 when not imported). */
  campsiteCount: number;
  updated: string;
}

export interface Campsite {
  id: string;
  name: string;
  loop: string;
  type: string;
  use: string;
  accessible: boolean;
  reservable: boolean;
  lat: number | null;
  lon: number | null;
  maxPeople: number | null;
  maxVehicles: number | null;
  /** Longest permitted RV/trailer, feet */
  maxLength: number | null;
  equipment: { name: string; maxLength: number | null }[];
  driveway: string;
  shade: string;
  pets: string;
  campfire: string;
  hookups: string[];
  features: string[];
  checkin: string;
  checkout: string;
}
