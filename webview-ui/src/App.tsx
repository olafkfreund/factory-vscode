import { motion } from "framer-motion";

const STAGES = ["Plan", "Code", "Test"] as const;

/**
 * Cockpit shell placeholder. The animated PARR pipeline, progress rings,
 * token/cost ticker, and embedded console are built in the cockpit milestone;
 * this verifies the React + framer-motion build wiring.
 */
export function App() {
  return (
    <div className="cockpit">
      <h1>Factory Cockpit</h1>
      <p className="subtitle">PARR pipeline, live in your editor.</p>
      <div className="stages">
        {STAGES.map((stage, i) => (
          <motion.div
            key={stage}
            className="stage"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12 }}
          >
            {stage}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
