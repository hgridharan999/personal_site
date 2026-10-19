import '../ascent/ascent.css';
import ClimateSearchPage from './ClimateSearchPage';

// The climate search page wears the Ascent dark skin through the .asc-climate
// overrides in ascent.css. That sheet used to arrive with the eager private shell;
// now that the shell loads on demand, this route brings it itself.
export default function ClimateSearchRoute() {
  return (
    <div className="asc-climate">
      <ClimateSearchPage />
    </div>
  );
}
