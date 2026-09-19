// airportHelp — the official help route for an airport, and nothing invented.
//
// Doctrine: Echo does not describe desks, signs or walking directions it cannot
// see. What it can hold honestly is the airport's own published page, kept by
// hand. An airport that is not on this list returns null, and the copy then
// says to use the departures board or airline staff instead.
export type AirportHelp = {
  /** Airport name as travellers say it. */
  name: string;
  /** The airport's own published page for flights and transfers. */
  url: string;
  /** What that page is, in plain words. */
  label: string;
};

const KEPT: Record<string, AirportHelp> = {
  TPE: { name: "Taoyuan (Taipei)", url: "https://www.taoyuan-airport.com/english/flightlive", label: "Official Taoyuan departures and transfer help" },
  BKK: { name: "Suvarnabhumi (Bangkok)", url: "https://suvarnabhumi.airportthai.co.th/en/flight-information", label: "Official Suvarnabhumi flight information" },
  DMK: { name: "Don Mueang (Bangkok)", url: "https://donmueang.airportthai.co.th/en/flight-information", label: "Official Don Mueang flight information" },
  IAD: { name: "Dulles (Washington)", url: "https://www.flydulles.com/flight-information", label: "Official Dulles flight information" },
  HKG: { name: "Hong Kong International", url: "https://www.hongkongairport.com/en/flights/departures/passenger.page", label: "Official Hong Kong departures" },
  NRT: { name: "Narita (Tokyo)", url: "https://www.narita-airport.jp/en/flight/", label: "Official Narita flight information" },
  HND: { name: "Haneda (Tokyo)", url: "https://tokyo-haneda.com/en/flight/", label: "Official Haneda flight information" },
  ICN: { name: "Incheon (Seoul)", url: "https://www.airport.kr/ap/en/dep/depPasseTrans.do", label: "Official Incheon transfer guide" },
  SIN: { name: "Changi (Singapore)", url: "https://www.changiairport.com/en/flights.html", label: "Official Changi flight information" },
  LHR: { name: "Heathrow (London)", url: "https://www.heathrow.com/departures", label: "Official Heathrow departures" },
  JFK: { name: "JFK (New York)", url: "https://www.jfkairport.com/flight-info", label: "Official JFK flight information" },
  EWR: { name: "Newark", url: "https://www.newarkairport.com/flight-info", label: "Official Newark flight information" },
  DXB: { name: "Dubai International", url: "https://www.dubaiairports.ae/flight-information", label: "Official Dubai flight information" },
};

export function airportHelp(iata: string | null | undefined): AirportHelp | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (code.length !== 3) return null;
  return KEPT[code] ?? null;
}

/** What to tell a traveller when there is no kept page for the airport. */
export const NO_HELP_PAGE = "No official page kept for this airport — use the departures board or an airline transfer desk.";
