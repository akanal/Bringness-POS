import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('config',Path(__file__).with_name('configure-shop-assistant.py'))
config=importlib.util.module_from_spec(spec);spec.loader.exec_module(config)
KEY='sk-synthetic_fixture_not_a_real_credential'

class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.dir=Path(self.tmp.name);self.path=self.dir/'app.env'
        self.original='DATABASE_URL=postgres://fixture\n# Keep configuration\nSHOP_ASSISTANT_API_KEY=old\nSHOP_ASSISTANT_MODEL=old\nSHOP_ASSISTANT_ENABLED=false\nSHOP_ASSISTANT_MODEL=duplicate\n'
        self.path.write_text(self.original);self.path.chmod(0o600)
    def tearDown(self): self.tmp.cleanup()
    def test_preserves_other_configuration_and_protected_backup(self):
        config.update_config(self.path,KEY,'fixture-model');text=self.path.read_text()
        self.assertTrue(text.startswith('DATABASE_URL=postgres://fixture\n# Keep configuration\n'))
        self.assertEqual(text.count('SHOP_ASSISTANT_MODEL='),1);self.assertIn('SHOP_ASSISTANT_ENABLED=true\n',text)
        backup=list(self.dir.glob('app.env.before-assistant-*'));self.assertEqual(len(backup),1)
        self.assertEqual(backup[0].read_text(),self.original)
        for p in [self.path,*backup]:self.assertEqual(p.stat().st_mode&0o777,0o600)
    def test_rejects_injection_before_touching_configuration(self):
        for key,model in [(KEY+'\nEVIL=1','fixture'),(KEY,'model\nEVIL=1'),('bad','fixture')]:
            with self.assertRaises(ValueError):config.update_config(self.path,key,model)
            self.assertEqual(self.path.read_text(),self.original)
    def test_rejects_shared_or_linked_files(self):
        self.path.chmod(0o644)
        with self.assertRaises(ValueError):config.update_config(self.path,KEY,'fixture')
        self.path.chmod(0o600);other=self.dir/'other';os.link(self.path,other)
        with self.assertRaises(ValueError):config.update_config(self.path,KEY,'fixture')
        other.unlink();self.path.rename(other);self.path.symlink_to(other)
        with self.assertRaises(ValueError):config.update_config(self.path,KEY,'fixture')
        self.assertEqual(other.read_text(),self.original)
    def test_refuses_shared_directory_and_symlink_lock(self):
        self.dir.chmod(0o777)
        with self.assertRaises(ValueError):config.update_config(self.path,KEY,'fixture')
        self.dir.chmod(0o700);lock=Path(str(self.path)+'.assistant.lock');lock.symlink_to(self.path)
        with self.assertRaises(OSError):config.update_config(self.path,KEY,'fixture')
        self.assertEqual(self.path.read_text(),self.original)

if __name__=='__main__': unittest.main()
