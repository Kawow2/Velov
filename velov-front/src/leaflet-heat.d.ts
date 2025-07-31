import * as L from "leaflet";

declare module "leaflet" {
  namespace heatLayer {
    function addTo(map: L.Map): any;
  }

  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: { radius?: number; blur?: number; maxZoom?: number }
  ): any;
}
